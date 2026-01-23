import { NextRequest, NextResponse } from 'next/server'
import { getAuctionHistory } from '@/lib/auction-store'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '24', 10)

    const history = await getAuctionHistory(Math.min(limit, 100))
    const repo = getRepository()

    // Format for response - fetch winning bids
    const formattedHistory = await Promise.all(
      history.map(async (slot) => {
        const winningBid = slot.winningBidId ? await repo.getBidById(slot.winningBidId) : null

        return {
          slotId: slot.slotId,
          slotTime: new Date(slot.slotId * 1000).toISOString(),
          settled: slot.settled,
          castHash: slot.castHash,
          tweetId: slot.tweetId,
          tweetUrl: slot.tweetId ? `https://x.com/i/status/${slot.tweetId}` : undefined,
          winningBid: winningBid
            ? {
                content: winningBid.content,
                bidAmount: winningBid.bidAmount,
                images: winningBid.images,
                embeds: winningBid.embeds,
              }
            : undefined,
        }
      })
    )

    return NextResponse.json({
      history: formattedHistory,
      count: formattedHistory.length,
    })
  } catch (error) {
    console.error('Error fetching auction history:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
