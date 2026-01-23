/**
 * Auction Store
 *
 * High-level API for auction operations.
 * Uses the database repository for persistence.
 */

import { getRepository, initializeDatabase } from './db'
import type { Bid, AuctionSlot } from './db'

export type { Bid, AuctionSlot } from './db'

// Ensure database is initialized
let initPromise: Promise<void> | null = null
function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initializeDatabase()
  }
  return initPromise
}

/**
 * Get the current slot ID (hour timestamp)
 */
export function getCurrentSlotId(): number {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  return Math.floor(now.getTime() / 1000)
}

/**
 * Get the next slot ID
 */
export function getNextSlotId(): number {
  return getCurrentSlotId() + 3600
}

/**
 * Time remaining in current auction (seconds)
 */
export function getTimeRemaining(): number {
  const now = Math.floor(Date.now() / 1000)
  const nextSlot = getNextSlotId()
  return nextSlot - now
}

/**
 * Check if a nullifier has been used
 */
export async function isNullifierUsed(nullifierHash: string): Promise<boolean> {
  await ensureInitialized()
  const repo = getRepository()
  return repo.isNullifierUsed(nullifierHash)
}

/**
 * Mark a nullifier as used
 */
export async function markNullifierUsed(nullifierHash: string): Promise<void> {
  await ensureInitialized()
  const repo = getRepository()
  return repo.markNullifierUsed(nullifierHash)
}

/**
 * Submit a bid for the current slot
 */
export async function submitBid(bid: Omit<Bid, 'id' | 'createdAt'>): Promise<Bid> {
  await ensureInitialized()
  const repo = getRepository()
  return repo.createBid(bid)
}

/**
 * Get all bids for a slot
 */
export async function getBidsForSlot(slotId: number): Promise<Bid[]> {
  await ensureInitialized()
  const repo = getRepository()
  return repo.getBidsForSlot(slotId)
}

/**
 * Get the highest bid for a slot
 */
export async function getHighestBid(slotId: number): Promise<Bid | null> {
  await ensureInitialized()
  const repo = getRepository()
  return repo.getHighestBidForSlot(slotId)
}

/**
 * Get current highest bid amount (for display)
 */
export async function getCurrentHighestBidAmount(slotId: number): Promise<string> {
  const highest = await getHighestBid(slotId)
  return highest?.bidAmount ?? '0'
}

/**
 * Get or create an auction slot
 */
export async function getSlot(slotId: number): Promise<AuctionSlot> {
  await ensureInitialized()
  const repo = getRepository()
  return repo.getSlot(slotId)
}

/**
 * Settle an auction slot
 */
export async function settleSlot(
  slotId: number,
  winningBid: Bid,
  castHash: string,
  tweetId?: string
): Promise<void> {
  await ensureInitialized()
  const repo = getRepository()
  await repo.settleSlot(slotId, winningBid.id, castHash, tweetId)
}

/**
 * Get the last winning slot (for reward distribution)
 */
export async function getLastWinningSlot(): Promise<AuctionSlot | undefined> {
  await ensureInitialized()
  const repo = getRepository()
  const slots = await repo.getSettledSlots(1)
  return slots[0]
}

/**
 * Get recent auction history
 */
export async function getAuctionHistory(limit: number = 24): Promise<AuctionSlot[]> {
  await ensureInitialized()
  const repo = getRepository()
  return repo.getSettledSlots(limit)
}
