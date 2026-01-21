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
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="flex items-center justify-center p-6">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    )
  }

  const isLastMinute = localTimeRemaining <= 60
  const hasNoBids = state.highestBid === '0'

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Timer */}
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${
                isLastMinute ? 'animate-pulse bg-destructive/20' : 'bg-primary/20'
              }`}
            >
              <Clock className={`h-6 w-6 ${isLastMinute ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <div>
              <div
                className={`font-mono text-2xl font-bold ${
                  isLastMinute ? 'text-destructive' : 'text-foreground'
                }`}
              >
                {formatTimeRemaining(localTimeRemaining)}
              </div>
              <div className="text-xs text-muted-foreground">until next slot</div>
            </div>
          </div>

          {/* Current bid */}
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="font-mono text-xl font-bold">
                {hasNoBids ? 'No bids' : `${formatBidAmount(state.highestBid)} $ANON`}
              </span>
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
