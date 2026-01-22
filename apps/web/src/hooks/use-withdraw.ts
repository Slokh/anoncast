'use client'

import { useState, useCallback, useRef } from 'react'
import {
  useAccount,
  useWriteContract,
} from 'wagmi'
import { formatUnits, pad, toHex } from 'viem'
import { CONTRACTS, TOKEN_DECIMALS } from '@/config/chains'
import { ANON_POOL_ABI } from '@/config/contracts'
import { generateProof, type ProofInput } from '@/lib/prover'
import { getProofMode } from './use-proof-mode'

export type WithdrawState =
  | 'idle'
  | 'preparing'
  | 'generating_proof'
  | 'withdrawing'
  | 'waiting_withdraw'
  | 'success'
  | 'error'

export type WithdrawResult = {
  txHash: string
  amount: bigint
  recipient: string
}

type Note = {
  secret: bigint
  nullifier: bigint
  commitment: bigint
  amount: bigint
  leafIndex: number
  timestamp?: number
}

type WithdrawPreparation = {
  inputNote: Note
  merkleProof: { path: bigint[]; indices: number[]; root: bigint }
  nullifierHash: bigint
}

export function useWithdraw() {
  const { address } = useAccount()
  const [state, setState] = useState<WithdrawState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WithdrawResult | null>(null)

  const { writeContractAsync } = useWriteContract()

  /**
   * Execute a withdrawal
   */
  const withdraw = useCallback(
    async (
      amount: bigint,
      prepareWithdraw: (amount: bigint) => Promise<WithdrawPreparation | null>,
      markNoteSpent: (commitment: bigint, txHash: string) => Promise<void>
    ): Promise<WithdrawResult | null> => {
      if (!address || !CONTRACTS.POOL) {
        setError('Wallet not connected or contracts not configured')
        setState('error')
        return null
      }

      setError(null)
      setResult(null)

      try {
        // Step 1: Prepare withdrawal data
        setState('preparing')
        const preparation = await prepareWithdraw(amount)

        if (!preparation) {
          throw new Error('No available notes for this withdrawal amount')
        }

        // Step 2: Generate ZK proof
        setState('generating_proof')

        const proofMode = getProofMode()
        console.log(`Generating withdraw proof (${proofMode} mode)...`)

        // Convert address to bigint for the circuit
        const recipientBigInt = BigInt(address)

        const proofInput: ProofInput = {
          note: preparation.inputNote,
          merklePath: preparation.merkleProof.path,
          merkleIndices: preparation.merkleProof.indices,
          merkleRoot: preparation.merkleProof.root,
          recipient: recipientBigInt,
        }

        const proofResult = await generateProof(proofInput, proofMode)

        console.log('Proof generated:', {
          proofLength: proofResult.proof.length,
          publicInputs: proofResult.publicInputs,
          mode: proofMode,
        })

        // Use raw proof bytes directly - Solidity verifier expects full 14080 bytes (440 * 32)
        // Do NOT use splitHonkProof or strip any headers
        const proofBytes = new Uint8Array(proofResult.proof)

        console.log('Proof length:', proofBytes.length, '(expected: 14080)')
        console.log('First 64 bytes of proof:', Array.from(proofBytes.slice(0, 64)))

        // Convert values to bytes32
        const nullifierHashBytes = pad(toHex(preparation.nullifierHash), { size: 32 }) as `0x${string}`
        const rootBytes = pad(toHex(preparation.merkleProof.root), { size: 32 }) as `0x${string}`

        // Step 3: Submit withdrawal transaction
        setState('withdrawing')

        console.log('Submitting withdraw transaction:', {
          proofHex: toHex(proofBytes).slice(0, 66) + '...',
          nullifierHash: nullifierHashBytes,
          root: rootBytes,
          amount: amount.toString(),
          recipient: address,
        })

        // Debug: Check if the merkle root is known on-chain
        console.log('Checking if merkle root is known on-chain...')
        const { createPublicClient, http } = await import('viem')
        const debugClient = createPublicClient({
          transport: http('http://127.0.0.1:8545'),
        })

        const isKnown = await debugClient.readContract({
          address: CONTRACTS.POOL,
          abi: [{ name: 'isKnownRoot', type: 'function', stateMutability: 'view', inputs: [{ name: 'root', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }] }],
          functionName: 'isKnownRoot',
          args: [rootBytes],
        })
        console.log('Is merkle root known?', isKnown)

        const lastRoot = await debugClient.readContract({
          address: CONTRACTS.POOL,
          abi: [{ name: 'getLastRoot', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bytes32' }] }],
          functionName: 'getLastRoot',
        })
        console.log('Last root on-chain:', lastRoot)

        console.log('Contract address:', CONTRACTS.POOL)
        console.log('About to call writeContractAsync...')

        let withdrawTxHash: string
        try {
          const txArgs = {
            address: CONTRACTS.POOL,
            abi: ANON_POOL_ABI,
            functionName: 'withdraw' as const,
            args: [
              toHex(proofBytes),
              nullifierHashBytes,
              rootBytes,
              amount,
              address,
            ] as const,
          }
          console.log('TX args prepared:', txArgs.functionName, txArgs.address)

          withdrawTxHash = await writeContractAsync(txArgs)
        } catch (txError) {
          console.error('writeContractAsync failed:', txError)
          throw txError
        }

        console.log('Transaction submitted:', withdrawTxHash)

        setState('waiting_withdraw')

        // Wait for transaction to be mined
        await new Promise((r) => setTimeout(r, 2000))

        // Mark note as spent
        await markNoteSpent(preparation.inputNote.commitment, withdrawTxHash)

        const withdrawResult: WithdrawResult = {
          txHash: withdrawTxHash,
          amount,
          recipient: address,
        }

        setResult(withdrawResult)
        setState('success')

        return withdrawResult
      } catch (err) {
        console.error('Withdraw error:', err)
        const errorMessage = err instanceof Error ? err.message : 'Withdrawal failed'

        // Provide clearer error messages for common issues
        // 0x9dd854d3 is the selector for InvalidProof()
        if (errorMessage.includes('InvalidProof') || errorMessage.includes('0x9dd854d3')) {
          setError('Invalid proof - the withdrawal proof was rejected by the contract.')
        } else if (errorMessage.includes('NullifierAlreadySpent') || errorMessage.includes('0x')) {
          setError('This note has already been spent.')
        } else if (errorMessage.includes('InvalidMerkleRoot')) {
          setError('The merkle root has expired. Please refresh and try again.')
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
  }, [])

  return {
    // State
    state,
    error,
    result,

    // Actions
    withdraw,
    reset,

    // Helpers
    formatTokenAmount: (amount: bigint) => formatUnits(amount, TOKEN_DECIMALS),
  }
}
