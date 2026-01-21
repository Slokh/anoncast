import { NextResponse } from 'next/server'
import {
  getCurrentSlotId,
  getNextSlotId,
  getCurrentHighestBidAmount,
  getTimeRemaining,
  getBidsForSlot,
} from '@/lib/auction-store'

export async function GET() {
  try {
    const currentSlotId = getCurrentSlotId()
    const nextSlotId = getNextSlotId()
    const highestBid = getCurrentHighestBidAmount(currentSlotId)
    const timeRemaining = getTimeRemaining()
    const bidCount = getBidsForSlot(currentSlotId).length

    return NextResponse.json({
      currentSlotId,
      nextSlotId,
      highestBid,
      timeRemaining,
      bidCount,
      // Format slot time for display
      slotTime: new Date(currentSlotId * 1000).toISOString(),
      nextSlotTime: new Date(nextSlotId * 1000).toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
