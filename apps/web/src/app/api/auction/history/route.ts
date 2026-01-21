import { NextRequest, NextResponse } from 'next/server'
import { getAuctionHistory } from '@/lib/auction-store'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '24', 10)

    const history = getAuctionHistory(Math.min(limit, 100))

    // Format for response (hide sensitive data)
    const formattedHistory = history.map((slot) => ({
      slotId: slot.slotId,
      slotTime: new Date(slot.slotId * 1000).toISOString(),
      settled: slot.settled,
      castHash: slot.castHash,
      tweetId: slot.tweetId,
      tweetUrl: slot.tweetId ? `https://x.com/i/status/${slot.tweetId}` : undefined,
      winningBid: slot.winningBid
        ? {
            content: slot.winningBid.content,
            bidAmount: slot.winningBid.bidAmount,
            images: slot.winningBid.images,
            embeds: slot.winningBid.embeds,
          }
        : undefined,
    }))

    return NextResponse.json({
      history: formattedHistory,
      count: formattedHistory.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
