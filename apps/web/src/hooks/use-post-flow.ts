'use client'

import { useState, useCallback } from 'react'
import { formatUnits, pad, toHex } from 'viem'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { CONTRACTS, TOKEN_DECIMALS } from '@/config/chains'
import { ANON_POOL_ABI, ERC20_ABI } from '@/config/contracts'
import { generateProof, type ProofInput } from '@/lib/prover'
import { getProofMode } from './use-proof-mode'
import type { Note, TransferPreparation, ConsolidationPreparation } from '@/providers/privacy-wallet'

export type PostFlowStep =
  | 'analyzing'
  | 'buying'
  | 'approving'
  | 'depositing'
  | 'consolidating'
  | 'posting'
  | 'done'

export type PostFlowState = {
  status: 'idle' | 'running' | 'success' | 'error'
  currentStep: PostFlowStep | null
  error: string | null
  progress: {
    current: number
    total: number
    label: string
  }
}

export type PostFlowPlan = {
  steps: PostFlowStep[]
  needsBuy: boolean
  needsDeposit: boolean
  needsConsolidate: boolean
  buyAmount: bigint
  depositAmount: bigint
  consolidateNotes: Note[]
  directNote: Note | null
  totalPrivateBalance: bigint
  publicBalance: bigint
  bidAmount: bigint
}

export function usePostFlow() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [state, setState] = useState<PostFlowState>({
    status: 'idle',
    currentStep: null,
    error: null,
    progress: { current: 0, total: 0, label: '' },
  })

  const [plan, setPlan] = useState<PostFlowPlan | null>(null)

  /**
   * Analyze balance and determine what steps are needed
   */
  const analyzePlan = useCallback(
    (
      bidAmount: bigint,
      notes: Note[],
      publicBalance: bigint,
      findNoteForTransfer: (amount: bigint) => Note | null
    ): PostFlowPlan => {
      const totalPrivateBalance = notes.reduce((sum, n) => sum + n.amount, 0n)
      const totalBalance = totalPrivateBalance + publicBalance

      // Check if we have a single note that covers the bid
      const directNote = findNoteForTransfer(bidAmount)

      if (directNote) {
        // Case 1: Direct post with existing note
        return {
          steps: ['posting'],
          needsBuy: false,
          needsDeposit: false,
          needsConsolidate: false,
          buyAmount: 0n,
          depositAmount: 0n,
          consolidateNotes: [],
          directNote,
          totalPrivateBalance,
          publicBalance,
          bidAmount,
        }
      }

      // Check if combining notes is sufficient
      if (totalPrivateBalance >= bidAmount) {
        // Case 2: Consolidate notes then post
        return {
          steps: ['consolidating', 'posting'],
          needsBuy: false,
          needsDeposit: false,
          needsConsolidate: true,
          buyAmount: 0n,
          depositAmount: 0n,
          consolidateNotes: notes,
          directNote: null,
          totalPrivateBalance,
          publicBalance,
          bidAmount,
        }
      }

      // Check if public balance helps
      if (totalBalance >= bidAmount) {
        // Case 3: Deposit public balance
        const shortfall = bidAmount - totalPrivateBalance
        const depositAmount = shortfall > publicBalance ? publicBalance : shortfall

        // If we have existing notes, we'll need to consolidate after deposit
        if (notes.length > 0) {
          // Case 3a: Deposit + consolidate + post
          return {
            steps: ['approving', 'depositing', 'consolidating', 'posting'],
            needsBuy: false,
            needsDeposit: true,
            needsConsolidate: true,
            buyAmount: 0n,
            depositAmount: bidAmount, // Deposit full amount to avoid consolidation complexity
            consolidateNotes: notes,
            directNote: null,
            totalPrivateBalance,
            publicBalance,
            bidAmount,
          }
        } else {
          // Case 3b: Just deposit + post (no existing notes)
          return {
            steps: ['approving', 'depositing', 'posting'],
            needsBuy: false,
            needsDeposit: true,
            needsConsolidate: false,
            buyAmount: 0n,
            depositAmount: bidAmount,
            consolidateNotes: [],
            directNote: null,
            totalPrivateBalance,
            publicBalance,
            bidAmount,
          }
        }
      }

      // Case 4: Need to buy tokens
      const buyAmount = bidAmount // Buy the full bid amount to get one clean note
      const steps: PostFlowStep[] = ['buying', 'approving', 'depositing']

      // If we have existing notes, include consolidation
      if (notes.length > 0) {
        steps.push('consolidating')
      }
      steps.push('posting')

      return {
        steps,
        needsBuy: true,
        needsDeposit: true,
        needsConsolidate: notes.length > 0,
        buyAmount,
        depositAmount: buyAmount,
        consolidateNotes: notes,
        directNote: null,
        totalPrivateBalance,
        publicBalance,
        bidAmount,
      }
    },
    []
  )

  /**
   * Execute the full post flow
   */
  const executeFlow = useCallback(
    async (
      flowPlan: PostFlowPlan,
      content: {
        text: string
        image?: string
        embed?: string
        slotId: number
      },
      callbacks: {
        prepareTransfer: (
          amount: bigint,
          claimCommitment: bigint
        ) => Promise<TransferPreparation | null>
        getClaimCredentials: (slotId: number) => { claimCommitment: bigint; claimSecret: bigint } | null
        prepareConsolidation: (notes: Note[]) => Promise<ConsolidationPreparation | null>
        markNotesSpent: (commitments: bigint[], txHash: string) => Promise<void>
        generateDeposit: (amount: bigint) => { commitment: bigint; note: { secret: bigint; nullifier: bigint; commitment: bigint; amount: bigint } & { index: number } } | null
        sync: () => Promise<void>
        findNoteForTransfer: (amount: bigint) => Note | null
        notes: Note[]
      }
    ): Promise<{ success: boolean; error?: string }> => {
      if (!address || !CONTRACTS.POOL) {
        return { success: false, error: 'Wallet not connected' }
      }

      setState({
        status: 'running',
        currentStep: 'analyzing',
        error: null,
        progress: { current: 0, total: flowPlan.steps.length, label: 'Analyzing...' },
      })

      try {
        let stepIndex = 0

        // Step: Buy tokens if needed (not yet implemented - would need swap integration)
        if (flowPlan.needsBuy && flowPlan.steps.includes('buying')) {
          stepIndex++
          setState((s) => ({
            ...s,
            currentStep: 'buying',
            progress: { current: stepIndex, total: flowPlan.steps.length, label: 'Buying ANON tokens...' },
          }))

          // For now, return an error since buy flow requires additional integration
          return { success: false, error: 'Buying tokens not yet implemented in this flow. Please use the Buy button separately.' }
        }

        // Step: Approve tokens if needed
        if (flowPlan.needsDeposit && flowPlan.steps.includes('approving')) {
          stepIndex++
          setState((s) => ({
            ...s,
            currentStep: 'approving',
            progress: { current: stepIndex, total: flowPlan.steps.length, label: 'Approving tokens...' },
          }))

          const approveTx = await writeContractAsync({
            address: CONTRACTS.ANON_TOKEN,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [CONTRACTS.POOL, flowPlan.depositAmount],
          })

          await publicClient?.waitForTransactionReceipt({ hash: approveTx })
        }

        // Step: Deposit tokens if needed
        if (flowPlan.needsDeposit && flowPlan.steps.includes('depositing')) {
          stepIndex++
          setState((s) => ({
            ...s,
            currentStep: 'depositing',
            progress: { current: stepIndex, total: flowPlan.steps.length, label: 'Depositing to privacy pool...' },
          }))

          const depositData = callbacks.generateDeposit(flowPlan.depositAmount)
          if (!depositData) {
            return { success: false, error: 'Failed to generate deposit data' }
          }

          const commitmentBytes = pad(toHex(depositData.commitment), { size: 32 })

          const depositTx = await writeContractAsync({
            address: CONTRACTS.POOL,
            abi: ANON_POOL_ABI,
            functionName: 'deposit',
            args: [commitmentBytes as `0x${string}`, flowPlan.depositAmount],
          })

          await publicClient?.waitForTransactionReceipt({ hash: depositTx })

          // Sync to get the new note
          await callbacks.sync()
        }

        // Step: Consolidate notes if needed
        if (flowPlan.needsConsolidate && flowPlan.steps.includes('consolidating')) {
          stepIndex++
          setState((s) => ({
            ...s,
            currentStep: 'consolidating',
            progress: { current: stepIndex, total: flowPlan.steps.length, label: 'Merging notes...' },
          }))

          // Re-fetch notes after deposit by syncing
          await callbacks.sync()

          // Get all current notes for consolidation
          // The callbacks.notes may be stale, so we need to use the updated notes from the sync
          // For now, we'll proceed with what we have and the sync should have updated the context
          const allNotes = callbacks.notes

          if (allNotes.length >= 2) {
            const preparation = await callbacks.prepareConsolidation(allNotes)
            if (!preparation) {
              return { success: false, error: 'Failed to prepare consolidation' }
            }

            const proofMode = getProofMode()
            const proofs: `0x${string}`[] = []
            const nullifierHashes: `0x${string}`[] = []
            const merkleRoots: `0x${string}`[] = []
            const amounts: bigint[] = []

            // Generate proofs for each note
            for (let i = 0; i < preparation.noteInputs.length; i++) {
              setState((s) => ({
                ...s,
                progress: {
                  ...s.progress,
                  label: `Generating consolidation proof ${i + 1}/${preparation.noteInputs.length}...`,
                },
              }))

              const input = preparation.noteInputs[i]

              const proofInput: ProofInput = {
                note: input.note,
                merklePath: input.merkleProof.path,
                merkleIndices: input.merkleProof.indices,
                merkleRoot: input.merkleProof.root,
                recipient: 0n, // Consolidation marker
              }

              const proofResult = await generateProof(proofInput, proofMode)
              const proofBytes = new Uint8Array(proofResult.proof)
              proofs.push(toHex(proofBytes))
              nullifierHashes.push(pad(toHex(input.nullifierHash), { size: 32 }) as `0x${string}`)
              merkleRoots.push(pad(toHex(input.merkleProof.root), { size: 32 }) as `0x${string}`)
              amounts.push(input.note.amount)
            }

            const newCommitmentBytes = pad(toHex(preparation.newNote.commitment), {
              size: 32,
            }) as `0x${string}`

            const consolidateTx = await writeContractAsync({
              address: CONTRACTS.POOL,
              abi: ANON_POOL_ABI,
              functionName: 'consolidate',
              args: [
                proofs,
                nullifierHashes,
                merkleRoots,
                amounts,
                newCommitmentBytes,
                preparation.totalAmount,
              ],
            })

            await publicClient?.waitForTransactionReceipt({ hash: consolidateTx })

            // Mark notes as spent
            const spentCommitments = preparation.noteInputs.map((input) => input.note.commitment)
            await callbacks.markNotesSpent(spentCommitments, consolidateTx)

            // Sync to get the new consolidated note
            await callbacks.sync()
          }
        }

        // Step: Post the bid
        stepIndex++
        setState((s) => ({
          ...s,
          currentStep: 'posting',
          progress: { current: stepIndex, total: flowPlan.steps.length, label: 'Submitting bid...' },
        }))

        const claimCreds = callbacks.getClaimCredentials(content.slotId)
        if (!claimCreds) {
          return { success: false, error: 'Wallet not unlocked' }
        }

        // Find the note to use
        const noteToUse = callbacks.findNoteForTransfer(flowPlan.bidAmount)
        if (!noteToUse) {
          // Try syncing one more time
          await callbacks.sync()
          const retryNote = callbacks.findNoteForTransfer(flowPlan.bidAmount)
          if (!retryNote) {
            return { success: false, error: 'No available note for bid after all operations' }
          }
        }

        const transferData = await callbacks.prepareTransfer(flowPlan.bidAmount, claimCreds.claimCommitment)
        if (!transferData) {
          return { success: false, error: 'Failed to prepare transfer' }
        }

        const mockProof = {
          proof: [],
          publicInputs: [
            `0x${transferData.nullifierHash.toString(16)}`,
            `0x${transferData.merkleProof.root.toString(16)}`,
            `0x${flowPlan.bidAmount.toString(16)}`,
            `0x${transferData.changeNote.commitment.toString(16)}`,
            `0x${transferData.changeNote.amount.toString(16)}`,
            `0x${claimCreds.claimCommitment.toString(16)}`,
          ],
        }

        const response = await fetch('/api/auction/bid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: content.text.trim(),
            images: content.image ? [content.image] : undefined,
            embeds: content.embed ? [content.embed] : undefined,
            bidAmount: flowPlan.bidAmount.toString(),
            proof: mockProof,
            claimCommitment: `0x${claimCreds.claimCommitment.toString(16)}`,
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          return { success: false, error: data.error || 'Failed to submit bid' }
        }

        // Notify other components
        window.dispatchEvent(new CustomEvent('auctionBidUpdate'))

        setState({
          status: 'success',
          currentStep: 'done',
          error: null,
          progress: { current: flowPlan.steps.length, total: flowPlan.steps.length, label: 'Complete!' },
        })

        return { success: true }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Something went wrong'
        setState((s) => ({
          ...s,
          status: 'error',
          error: errorMessage,
        }))
        return { success: false, error: errorMessage }
      }
    },
    [address, publicClient, writeContractAsync]
  )

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      currentStep: null,
      error: null,
      progress: { current: 0, total: 0, label: '' },
    })
    setPlan(null)
  }, [])

  return {
    state,
    plan,
    setPlan,
    analyzePlan,
    executeFlow,
    reset,
    formatAmount: (amount: bigint) => {
      const num = Number(formatUnits(amount, TOKEN_DECIMALS))
      return Math.floor(num).toLocaleString()
    },
  }
}
