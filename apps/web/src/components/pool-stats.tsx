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
    <div className="rounded-lg border border-border bg-gradient-to-br from-card to-card/50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">In the pool</p>
          <p className="text-2xl font-mono font-bold tabular-nums">
            {isLoading ? (
              <span className="text-muted-foreground animate-pulse">...</span>
            ) : (
              <>{formattedTotal} <span className="text-base font-normal text-primary">$ANON</span></>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Deposits</p>
          <p className="text-2xl font-mono font-bold tabular-nums">
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
