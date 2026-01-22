'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, TrendingUp } from 'lucide-react'

type HighestBidContent = {
  content: string
  images?: string[]
  embeds?: string[]
}

type AuctionState = {
  currentSlotId: number
  nextSlotId: number
  highestBid: string
  highestBidContent?: HighestBidContent
  timeRemaining: number
  bidCount: number
  slotTime: string
}

type MockBidType = 'none' | 'text' | 'image' | 'link'

const MOCK_BIDS: Record<Exclude<MockBidType, 'none'>, Partial<AuctionState>> = {
  text: {
    highestBid: '42000000000000000000', // 42 tokens
    bidCount: 3,
    highestBidContent: {
      content: 'gm anons! this is what a winning bid post looks like. it can be up to 320 characters and will be posted to the timeline when the auction ends. 🎭',
    },
  },
  image: {
    highestBid: '69000000000000000000', // 69 tokens
    bidCount: 5,
    highestBidContent: {
      content: 'check out this rare pepe i found. mass posting this everywhere for maximum exposure.',
      images: ['https://i.imgflip.com/9f66pz.jpg'],
    },
  },
  link: {
    highestBid: '100000000000000000000', // 100 tokens
    bidCount: 7,
    highestBidContent: {
      content: 'just mass bought the dip. here\'s my alpha on why ANON is going to 10x from here.',
      embeds: ['https://dexscreener.com/base/0x0Db510e79909666d6dEc7f5e49370838c16D950f'],
    },
  },
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
  const [mockBidType, setMockBidType] = useState<MockBidType>('none')

  // Check localStorage for mock bid setting
  useEffect(() => {
    const stored = localStorage.getItem('anon:mockBid') as MockBidType | null
    setMockBidType(stored || 'none')

    // Listen for storage changes (from other components)
    const handleStorage = () => {
      const updated = localStorage.getItem('anon:mockBid') as MockBidType | null
      setMockBidType(updated || 'none')
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('mockBidToggle', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('mockBidToggle', handleStorage)
    }
  }, [])

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

  // Apply mock bid overlay if enabled
  const mockBid = mockBidType !== 'none' ? MOCK_BIDS[mockBidType] : null
  const displayState = state ? {
    ...state,
    ...(mockBid || {}),
  } : null

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

  if (!displayState) {
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
  const hasNoBids = displayState.highestBid === '0'
  const hasContent = displayState.highestBidContent?.content

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
                {hasNoBids ? 'No bids' : formatBidAmount(displayState.highestBid)}
              </span>
              {!hasNoBids && <span className="text-sm text-primary">ANON</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {displayState.bidCount} bid{displayState.bidCount !== 1 ? 's' : ''} this hour
            </div>
          </div>
        </div>

        {/* Current highest bid content */}
        {hasContent && (
          <div className="-mx-4 mt-3 border-t border-border/50 px-4 pt-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Current leading post</div>
            <p className="mt-2 text-sm text-foreground">{displayState.highestBidContent!.content}</p>
            {displayState.highestBidContent!.images?.[0] && (
              <div className="mt-2 overflow-hidden rounded-lg">
                <img
                  src={displayState.highestBidContent!.images[0]}
                  alt="Post image"
                  className="max-h-[200px] w-full object-cover"
                />
              </div>
            )}
            {displayState.highestBidContent!.embeds?.[0] && (
              <a
                href={displayState.highestBidContent!.embeds[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block truncate rounded-lg border border-border/50 bg-white/5 px-3 py-2 text-xs text-primary hover:bg-white/10"
              >
                {displayState.highestBidContent!.embeds[0]}
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
