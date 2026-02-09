'use client'

import { useState, useCallback } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { formatUnits, pad, toHex } from 'viem'
import { CONTRACTS, TOKEN_DECIMALS } from '@/config/chains'
import { ANON_POOL_ABI } from '@/config/contracts'
import { generateProof, type ProofInput } from '@/lib/prover'
import { getProofMode } from './use-proof-mode'
import type { WithdrawPreparation } from '@anon/sdk/blockchain'

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

        // Use raw proof bytes directly - Solidity verifier expects full 14080 bytes (440 * 32)
        // Do NOT use splitHonkProof or strip any headers
        const proofBytes = new Uint8Array(proofResult.proof)

        // Convert values to bytes32
        const nullifierHashBytes = pad(toHex(preparation.nullifierHash), {
          size: 32,
        }) as `0x${string}`
        const rootBytes = pad(toHex(preparation.merkleProof.root), { size: 32 }) as `0x${string}`

        // Step 3: Submit withdrawal transaction
        setState('withdrawing')

        const withdrawTxHash = await writeContractAsync({
          address: CONTRACTS.POOL,
          abi: ANON_POOL_ABI,
          functionName: 'withdraw' as const,
          args: [toHex(proofBytes), nullifierHashBytes, rootBytes, amount, address] as const,
        })

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
        } else if (
          errorMessage.includes('NullifierAlreadySpent') ||
          errorMessage.includes('0x26c84c78')
        ) {
          // 0x26c84c78 is the selector for NullifierAlreadySpent()
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
