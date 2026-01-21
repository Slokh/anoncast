'use client'

import { useState, useCallback } from 'react'
import {
  useAccount,
  useWriteContract,
  usePublicClient,
} from 'wagmi'
import { formatUnits, pad, toHex } from 'viem'
import { CONTRACTS, TOKEN_DECIMALS } from '@/config/chains'
import { ANON_POOL_ABI } from '@/config/contracts'

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

type WithdrawPreparation = {
  inputNote: {
    secret: bigint
    nullifier: bigint
    commitment: bigint
    amount: bigint
    leafIndex: number
  }
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

        // Step 2: Generate proof (mock for now)
        setState('generating_proof')

        // In production, this would generate a real ZK proof
        // For now, we create a placeholder proof
        // The verifier contract determines if proofs are verified
        const mockProof = new Uint8Array(64) // Placeholder proof bytes

        // Convert values to bytes32
        const nullifierHashBytes = pad(toHex(preparation.nullifierHash), { size: 32 }) as `0x${string}`
        const rootBytes = pad(toHex(preparation.merkleProof.root), { size: 32 }) as `0x${string}`

        // Step 3: Submit withdrawal transaction
        setState('withdrawing')

        // Debug log the withdraw parameters
        console.log('Withdraw params:', {
          proof: toHex(mockProof),
          nullifierHash: nullifierHashBytes,
          root: rootBytes,
          amount: amount.toString(),
          recipient: address,
        })

        const withdrawTxHash = await writeContractAsync({
          address: CONTRACTS.POOL,
          abi: ANON_POOL_ABI,
          functionName: 'withdraw',
          args: [
            toHex(mockProof),
            nullifierHashBytes,
            rootBytes,
            amount,
            address,
          ],
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
        if (errorMessage.includes('InvalidProof') || errorMessage.includes('0x9dd854d3') || errorMessage.includes('execution reverted')) {
          setError('Withdrawal proof generation is not yet implemented. This feature is coming soon.')
        } else if (errorMessage.includes('gas')) {
          setError('Transaction failed: Gas estimation error. The contract may have rejected the transaction.')
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
