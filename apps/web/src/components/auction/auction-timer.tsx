'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, TrendingUp } from 'lucide-react'

type AuctionState = {
  currentSlotId: number
  nextSlotId: number
  highestBid: string
  timeRemaining: number
  bidCount: number
  slotTime: string
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return '00:00'

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatBidAmount(amount: string): string {
  const value = BigInt(amount)
  const formatted = Number(value / BigInt(10 ** 18))
  return formatted.toLocaleString()
}

export function AuctionTimer() {
  const [state, setState] = useState<AuctionState | null>(null)
  const [localTimeRemaining, setLocalTimeRemaining] = useState<number>(0)

  // Fetch auction state
  useEffect(() => {
    async function fetchState() {
      try {
        const res = await fetch('/api/auction/current')
        if (res.ok) {
          const data = await res.json()
          setState(data)
          setLocalTimeRemaining(data.timeRemaining)
        }
      } catch {
        // Silent fail
      }
    }

    fetchState()
    const interval = setInterval(fetchState, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalTimeRemaining((prev) => {
        if (prev <= 0) return 0
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  if (!state) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="h-6 w-14 animate-pulse rounded bg-muted" />
                <div className="mt-1 h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="text-right">
              <div className="h-6 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-1 h-3 w-16 animate-pulse rounded bg-muted ml-auto" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isLastMinute = localTimeRemaining <= 60
  const hasNoBids = state.highestBid === '0'

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                isLastMinute ? 'animate-pulse bg-destructive/10' : 'bg-primary/10'
              }`}
            >
              <Clock className={`h-5 w-5 ${isLastMinute ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <div>
              <div
                className={`font-mono text-xl font-bold tabular-nums ${
                  isLastMinute ? 'text-destructive' : 'text-foreground'
                }`}
              >
                {formatTimeRemaining(localTimeRemaining)}
              </div>
              <div className="text-xs text-muted-foreground">until next slot</div>
            </div>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="font-mono text-xl font-bold tabular-nums">
                {hasNoBids ? 'No bids' : formatBidAmount(state.highestBid)}
              </span>
              {!hasNoBids && <span className="text-sm text-primary">$ANON</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {state.bidCount} bid{state.bidCount !== 1 ? 's' : ''} this hour
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
