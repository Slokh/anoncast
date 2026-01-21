/**
 * Auction Store
 *
 * In production, this would be backed by a database (e.g., Postgres, Redis).
 * For now, using in-memory storage as a placeholder.
 */

export type Bid = {
  id: string
  slotId: number // Hour timestamp (XX:00)
  bidAmount: string
  content: string
  images?: string[]
  embeds?: string[]
  proof: {
    proof: number[]
    publicInputs: string[]
  }
  nullifierHash: string
  claimCommitment: string
  createdAt: number
}

export type AuctionSlot = {
  slotId: number
  winningBid?: Bid
  settled: boolean
  castHash?: string
  tweetId?: string
}

// In-memory store (replace with database in production)
const bids: Map<string, Bid> = new Map()
const slots: Map<number, AuctionSlot> = new Map()
const usedNullifiers: Set<string> = new Set()

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
 * Check if a nullifier has been used
 */
export function isNullifierUsed(nullifierHash: string): boolean {
  return usedNullifiers.has(nullifierHash)
}

/**
 * Mark a nullifier as used
 */
export function markNullifierUsed(nullifierHash: string): void {
  usedNullifiers.add(nullifierHash)
}

/**
 * Submit a bid for the current slot
 */
export function submitBid(bid: Omit<Bid, 'id' | 'createdAt'>): Bid {
  const id = crypto.randomUUID()
  const fullBid: Bid = {
    ...bid,
    id,
    createdAt: Date.now(),
  }
  bids.set(id, fullBid)
  return fullBid
}

/**
 * Get all bids for a slot
 */
export function getBidsForSlot(slotId: number): Bid[] {
  return Array.from(bids.values())
    .filter((bid) => bid.slotId === slotId)
    .sort((a, b) => BigInt(b.bidAmount) > BigInt(a.bidAmount) ? 1 : -1)
}

/**
 * Get the highest bid for a slot
 */
export function getHighestBid(slotId: number): Bid | undefined {
  const slotBids = getBidsForSlot(slotId)
  return slotBids[0]
}

/**
 * Get current highest bid amount (for display)
 */
export function getCurrentHighestBidAmount(slotId: number): string {
  const highest = getHighestBid(slotId)
  return highest?.bidAmount ?? '0'
}

/**
 * Get or create an auction slot
 */
export function getSlot(slotId: number): AuctionSlot {
  let slot = slots.get(slotId)
  if (!slot) {
    slot = { slotId, settled: false }
    slots.set(slotId, slot)
  }
  return slot
}

/**
 * Settle an auction slot
 */
export function settleSlot(slotId: number, winningBid: Bid, castHash: string, tweetId?: string): void {
  const slot = getSlot(slotId)
  slot.winningBid = winningBid
  slot.settled = true
  slot.castHash = castHash
  slot.tweetId = tweetId
  markNullifierUsed(winningBid.nullifierHash)
}

/**
 * Get the last winning slot (for reward distribution)
 */
export function getLastWinningSlot(): AuctionSlot | undefined {
  const settledSlots = Array.from(slots.values())
    .filter((s) => s.settled && s.winningBid)
    .sort((a, b) => b.slotId - a.slotId)
  return settledSlots[0]
}

/**
 * Get recent auction history
 */
export function getAuctionHistory(limit: number = 24): AuctionSlot[] {
  return Array.from(slots.values())
    .filter((s) => s.settled)
    .sort((a, b) => b.slotId - a.slotId)
    .slice(0, limit)
}

/**
 * Time remaining in current auction (seconds)
 */
export function getTimeRemaining(): number {
  const now = Math.floor(Date.now() / 1000)
  const nextSlot = getNextSlotId()
  return nextSlot - now
}
