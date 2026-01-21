'use client'

import { Card, CardContent } from '@/components/ui/card'
import { usePoolStats } from '@/hooks/use-pool-stats'
import { Shield, Users, Database } from 'lucide-react'

export function PoolStats() {
  const { stats, isLoading, formatAmount } = usePoolStats()

  // Show skeleton while loading to prevent layout shift
  // Using h-5 to match text-sm line-height (1.25rem = 20px)
  if (isLoading || !stats) {
    return (
      <Card className="border-border/50 bg-muted/30">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <div className="h-5 w-16 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 bg-muted/30">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <span className="text-muted-foreground">Pool TVL: </span>
              <span className="font-mono font-semibold">
                {formatAmount(stats.totalDeposited)} $ANON
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <span className="text-muted-foreground">Deposits: </span>
              <span className="font-mono font-semibold">
                {stats.leafCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            {stats.utilizationPercent.toFixed(2)}% full
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
