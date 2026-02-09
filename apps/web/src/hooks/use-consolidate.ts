'use client'

import { useState, useCallback } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { formatUnits, pad, toHex } from 'viem'
import { CONTRACTS, TOKEN_DECIMALS } from '@/config/chains'
import { ANON_POOL_ABI } from '@/config/contracts'
import { generateProof, type ProofInput } from '@/lib/prover'
import { getProofMode } from './use-proof-mode'
import type { Note } from '@anon/sdk/core'

export type ConsolidateState =
  | 'idle'
  | 'preparing'
  | 'generating_proofs'
  | 'consolidating'
  | 'waiting_consolidate'
  | 'success'
  | 'error'

export type ConsolidateResult = {
  txHash: string
  totalAmount: bigint
  notesConsolidated: number
}

type NoteInput = {
  note: Note
  merkleProof: { path: bigint[]; indices: number[]; root: bigint }
  nullifierHash: bigint
}

type ConsolidationPreparation = {
  noteInputs: NoteInput[]
  newNote: Omit<Note, 'leafIndex' | 'timestamp'>
  newNoteIndex: number
  totalAmount: bigint
}

export function useConsolidate() {
  const { address } = useAccount()
  const [state, setState] = useState<ConsolidateState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ConsolidateResult | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const { writeContractAsync } = useWriteContract()

  /**
   * Execute consolidation of multiple notes
   */
  const consolidate = useCallback(
    async (
      prepareConsolidation: (notes: Note[]) => Promise<ConsolidationPreparation | null>,
      notes: Note[],
      markNotesSpent: (commitments: bigint[], txHash: string) => Promise<void>
    ): Promise<ConsolidateResult | null> => {
      if (!address || !CONTRACTS.POOL) {
        setError('Wallet not connected or contracts not configured')
        setState('error')
        return null
      }

      if (notes.length < 2) {
        setError('Need at least 2 notes to consolidate')
        setState('error')
        return null
      }

      setError(null)
      setResult(null)
      setProgress({ current: 0, total: notes.length })

      try {
        // Step 1: Prepare consolidation data
        setState('preparing')
        const preparation = await prepareConsolidation(notes)

        if (!preparation) {
          throw new Error('Failed to prepare consolidation')
        }

        // Step 2: Generate ZK proofs for each note (withdraw proofs with recipient = address(0))
        setState('generating_proofs')

        const proofMode = getProofMode()
        const proofs: `0x${string}`[] = []
        const nullifierHashes: `0x${string}`[] = []
        const merkleRoots: `0x${string}`[] = []
        const amounts: bigint[] = []

        for (let i = 0; i < preparation.noteInputs.length; i++) {
          setProgress({ current: i + 1, total: preparation.noteInputs.length })

          const input = preparation.noteInputs[i]

          // Generate withdraw proof with recipient = 0 (consolidation marker)
          const proofInput: ProofInput = {
            note: input.note,
            merklePath: input.merkleProof.path,
            merkleIndices: input.merkleProof.indices,
            merkleRoot: input.merkleProof.root,
            recipient: 0n, // address(0) signals consolidation
          }

          const proofResult = await generateProof(proofInput, proofMode)

          // Convert proof to hex
          const proofBytes = new Uint8Array(proofResult.proof)
          proofs.push(toHex(proofBytes))

          // Convert other values to bytes32
          nullifierHashes.push(pad(toHex(input.nullifierHash), { size: 32 }) as `0x${string}`)
          merkleRoots.push(pad(toHex(input.merkleProof.root), { size: 32 }) as `0x${string}`)
          amounts.push(input.note.amount)
        }

        // Convert new commitment to bytes32
        const newCommitmentBytes = pad(toHex(preparation.newNote.commitment), {
          size: 32,
        }) as `0x${string}`

        // Step 3: Submit consolidation transaction
        setState('consolidating')

        const consolidateTxHash = await writeContractAsync({
          address: CONTRACTS.POOL,
          abi: ANON_POOL_ABI,
          functionName: 'consolidate' as const,
          args: [
            proofs,
            nullifierHashes,
            merkleRoots,
            amounts,
            newCommitmentBytes,
            preparation.totalAmount,
          ] as const,
        })

        setState('waiting_consolidate')

        // Wait for transaction to be mined
        await new Promise((r) => setTimeout(r, 2000))

        // Mark all input notes as spent
        const spentCommitments = preparation.noteInputs.map((input) => input.note.commitment)
        await markNotesSpent(spentCommitments, consolidateTxHash)

        const consolidateResult: ConsolidateResult = {
          txHash: consolidateTxHash,
          totalAmount: preparation.totalAmount,
          notesConsolidated: notes.length,
        }

        setResult(consolidateResult)
        setState('success')

        return consolidateResult
      } catch (err) {
        console.error('Consolidate error:', err)
        const errorMessage = err instanceof Error ? err.message : 'Consolidation failed'

        if (errorMessage.includes('InvalidProof') || errorMessage.includes('0x9dd854d3')) {
          setError('Invalid proof - one of the proofs was rejected.')
        } else if (
          errorMessage.includes('NullifierAlreadySpent') ||
          errorMessage.includes('0x26c84c78')
        ) {
          setError('One of the notes has already been spent.')
        } else if (errorMessage.includes('InvalidMerkleRoot')) {
          setError('A merkle root has expired. Please refresh and try again.')
        } else if (errorMessage.includes('user rejected')) {
          setError('Transaction rejected')
        } else if (errorMessage.includes('execution reverted')) {
          setError('Transaction reverted: ' + errorMessage)
        } else {
          setError(errorMessage)
        }
        setState('error')
        return null
      }
    },
    [address, writeContractAsync]
  )

  const reset = useCallback(() => {
    setState('idle')
    setError(null)
    setResult(null)
    setProgress({ current: 0, total: 0 })
  }, [])

  return {
    // State
    state,
    error,
    result,
    progress,

    // Actions
    consolidate,
    reset,

    // Helpers
    formatTokenAmount: (amount: bigint) => formatUnits(amount, TOKEN_DECIMALS),
  }
}
