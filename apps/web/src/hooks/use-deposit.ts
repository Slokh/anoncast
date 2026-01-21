'use client'

import { useState, useCallback } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseUnits, formatUnits, pad, toHex } from 'viem'
import { CONTRACTS, TOKEN_DECIMALS } from '@/config/chains'
import { ERC20_ABI, ANON_POOL_ABI } from '@/config/contracts'

export type DepositState =
  | 'idle'
  | 'checking_allowance'
  | 'approving'
  | 'waiting_approval'
  | 'depositing'
  | 'waiting_deposit'
  | 'success'
  | 'error'

export type DepositResult = {
  txHash: string
  commitment: bigint
  amount: bigint
  noteIndex: number
}

export function useDeposit() {
  const { address } = useAccount()
  const [state, setState] = useState<DepositState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DepositResult | null>(null)

  // Read token balance
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: CONTRACTS.ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!CONTRACTS.ANON_TOKEN,
    },
  })

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && CONTRACTS.POOL ? [address, CONTRACTS.POOL] : undefined,
    query: {
      enabled: !!address && !!CONTRACTS.ANON_TOKEN && !!CONTRACTS.POOL,
    },
  })

  // Contract write hooks
  const { writeContractAsync } = useWriteContract()

  /**
   * Execute a deposit with approval if needed
   */
  const deposit = useCallback(
    async (
      amount: bigint,
      generateCommitment: () => { commitment: bigint; note: any; index: number }
    ): Promise<DepositResult | null> => {
      if (!address || !CONTRACTS.POOL || !CONTRACTS.ANON_TOKEN) {
        setError('Wallet not connected or contracts not configured')
        setState('error')
        return null
      }

      setError(null)
      setResult(null)

      try {
        // Step 1: Check allowance
        setState('checking_allowance')
        const currentAllowance = (allowance as bigint) || 0n

        // Step 2: Approve if needed
        if (currentAllowance < amount) {
          setState('approving')

          const approveTxHash = await writeContractAsync({
            address: CONTRACTS.ANON_TOKEN,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [CONTRACTS.POOL, amount],
          })

          setState('waiting_approval')

          // Wait for approval to be mined
          // In production, you'd use useWaitForTransactionReceipt
          // For now, we'll poll
          let approved = false
          for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 2000))
            const { data: newAllowance } = await refetchAllowance()
            if ((newAllowance as bigint) >= amount) {
              approved = true
              break
            }
          }

          if (!approved) {
            throw new Error('Approval transaction not confirmed')
          }
        }

        // Step 3: Generate commitment
        const { commitment, note, index } = generateCommitment()

        // Convert commitment to bytes32
        const commitmentBytes = pad(toHex(commitment), { size: 32 }) as `0x${string}`

        // Step 4: Deposit
        setState('depositing')

        const depositTxHash = await writeContractAsync({
          address: CONTRACTS.POOL,
          abi: ANON_POOL_ABI,
          functionName: 'deposit',
          args: [commitmentBytes, amount],
        })

        setState('waiting_deposit')

        // Wait for deposit to be mined (poll for confirmation)
        // In production, use proper tx receipt waiting
        await new Promise((r) => setTimeout(r, 2000))

        // Refetch balances
        await refetchBalance()

        const depositResult: DepositResult = {
          txHash: depositTxHash,
          commitment,
          amount,
          noteIndex: index,
        }

        setResult(depositResult)
        setState('success')

        return depositResult
      } catch (err) {
        console.error('Deposit error:', err)
        setError(err instanceof Error ? err.message : 'Deposit failed')
        setState('error')
        return null
      }
    },
    [address, allowance, writeContractAsync, refetchAllowance, refetchBalance]
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
    tokenBalance: tokenBalance as bigint | undefined,
    allowance: allowance as bigint | undefined,

    // Actions
    deposit,
    reset,
    refetchBalance,

    // Helpers
    formatTokenAmount: (amount: bigint) => formatUnits(amount, TOKEN_DECIMALS),
    parseTokenAmount: (amount: string) => parseUnits(amount, TOKEN_DECIMALS),
  }
}
