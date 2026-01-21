import { NextRequest, NextResponse } from 'next/server'
import {
  getCurrentSlotId,
  getHighestBid,
  getSlot,
  settleSlot,
  getLastWinningSlot,
} from '@/lib/auction-store'
import { getNeynar } from '@/services/neynar'
import { getTwitter } from '@/services/twitter'

// Secret key for cron job authentication
const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the slot that just ended (previous hour)
    const currentSlotId = getCurrentSlotId()
    const previousSlotId = currentSlotId - 3600

    const slot = getSlot(previousSlotId)

    // Check if already settled
    if (slot.settled) {
      return NextResponse.json({
        success: true,
        message: 'Slot already settled',
        slotId: previousSlotId,
      })
    }

    // Get highest bid
    const winningBid = getHighestBid(previousSlotId)

    if (!winningBid) {
      // No bids - nothing to settle
      return NextResponse.json({
        success: true,
        message: 'No bids for this slot',
        slotId: previousSlotId,
      })
    }

    // Post to Farcaster
    const neynar = getNeynar()
    const castResult = await neynar.createCast({
      text: winningBid.content,
      images: winningBid.images,
      embeds: winningBid.embeds,
    })

    if (!castResult.success) {
      return NextResponse.json(
        { error: 'Failed to create cast' },
        { status: 500 }
      )
    }

    // Post to Twitter
    let tweetId: string | undefined
    try {
      const twitter = getTwitter()
      const twitterResult = await twitter.postTweet({
        text: winningBid.content,
        images: winningBid.images?.slice(0, 4),
      })
      if (twitterResult.success) {
        tweetId = twitterResult.tweetId
      }
    } catch {
      // Silently fail Twitter - Farcaster succeeded
    }

    // Settle the slot
    settleSlot(previousSlotId, winningBid, castResult.cast.hash, tweetId)

    // TODO: Trigger on-chain settlement
    // This would call the smart contract to:
    // 1. Mark the nullifier as spent
    // 2. Transfer bid amount to previous winner (or genesis recipient)
    //
    // const lastWinner = getLastWinningSlot()
    // await settleOnChain(previousSlotId, winningBid, lastWinner)

    return NextResponse.json({
      success: true,
      slotId: previousSlotId,
      castHash: castResult.cast.hash,
      tweetId,
      bidAmount: winningBid.bidAmount,
      // Info about reward distribution
      rewardInfo: {
        previousWinner: getLastWinningSlot()?.slotId,
        amount: winningBid.bidAmount,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
