'use client'

import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { CONTRACTS, TOKEN_DECIMALS } from '@/config/chains'
import { ANON_POOL_ABI } from '@/config/contracts'

export type PoolStats = {
  totalDeposited: bigint
  leafCount: number
  currentRoot: string
  treeCapacity: number
  utilizationPercent: number
}

export function usePoolStats() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: CONTRACTS.POOL,
    abi: ANON_POOL_ABI,
    functionName: 'getPoolStats',
    query: {
      enabled: !!CONTRACTS.POOL,
      refetchInterval: 30000, // Refresh every 30 seconds
    },
  })

  const stats: PoolStats | null = data
    ? {
        totalDeposited: data[0],
        leafCount: Number(data[1]),
        currentRoot: data[2],
        treeCapacity: Number(data[3]),
        utilizationPercent: (Number(data[1]) / Number(data[3])) * 100,
      }
    : null

  return {
    stats,
    isLoading,
    error: error?.message,
    refetch,
    formatAmount: (amount: bigint) => formatUnits(amount, TOKEN_DECIMALS),
  }
}
