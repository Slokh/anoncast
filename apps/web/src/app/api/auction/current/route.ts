import { NextResponse } from 'next/server'
import {
  getCurrentSlotId,
  getNextSlotId,
  getHighestBid,
  getTimeRemaining,
  getBidsForSlot,
} from '@/lib/auction-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const currentSlotId = getCurrentSlotId()
    const nextSlotId = getNextSlotId()
    const timeRemaining = getTimeRemaining()

    // These are now async
    const [highestBidData, bids] = await Promise.all([
      getHighestBid(currentSlotId),
      getBidsForSlot(currentSlotId),
    ])

    return NextResponse.json({
      currentSlotId,
      nextSlotId,
      highestBid: highestBidData?.bidAmount ?? '0',
      highestBidContent: highestBidData
        ? {
            content: highestBidData.content,
            images: highestBidData.images,
            embeds: highestBidData.embeds,
          }
        : undefined,
      timeRemaining,
      bidCount: bids.length,
      // Format slot time for display
      slotTime: new Date(currentSlotId * 1000).toISOString(),
      nextSlotTime: new Date(nextSlotId * 1000).toISOString(),
    })
  } catch (error) {
    console.error('Error fetching auction state:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
