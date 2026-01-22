'use client'

import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { CONTRACTS, TOKEN_DECIMALS } from '@/config/chains'
import { ANON_POOL_ABI } from '@/config/contracts'

export function PoolStats() {
  const { data: stats, isLoading } = useReadContract({
    address: CONTRACTS.POOL,
    abi: ANON_POOL_ABI,
    functionName: 'getPoolStats',
    query: {
      refetchInterval: 10000,
    },
  })

  if (!CONTRACTS.POOL) return null

  const totalDeposited = stats?.[0] ?? 0n
  const leafCount = stats?.[1] ?? 0

  const formattedTotal = Number(formatUnits(totalDeposited, TOKEN_DECIMALS)).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })

  return (
    <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Total in pool</p>
          <p className="text-xl font-mono font-bold tabular-nums">
            {isLoading ? (
              <span className="text-muted-foreground animate-pulse">...</span>
            ) : (
              <>{formattedTotal} <span className="text-sm font-normal text-primary">$ANON</span></>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Deposits</p>
          <p className="text-xl font-mono font-bold tabular-nums">
            {isLoading ? (
              <span className="text-muted-foreground animate-pulse">...</span>
            ) : (
              leafCount.toString()
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
