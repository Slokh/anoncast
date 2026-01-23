/**
 * Database types for the auction system
 */

export type Bid = {
  id: string
  slotId: number // Hour timestamp (XX:00)
  bidAmount: string // Stored as string to handle bigint
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
  winningBidId?: string
  settled: boolean
  castHash?: string
  tweetId?: string
}

/**
 * Repository interface - implement this for different database backends
 */
export interface AuctionRepository {
  // Bids
  createBid(bid: Omit<Bid, 'id' | 'createdAt'>): Promise<Bid>
  getBidById(id: string): Promise<Bid | null>
  getBidsForSlot(slotId: number): Promise<Bid[]>
  getHighestBidForSlot(slotId: number): Promise<Bid | null>

  // Slots
  getSlot(slotId: number): Promise<AuctionSlot>
  settleSlot(
    slotId: number,
    winningBidId: string,
    castHash: string,
    tweetId?: string
  ): Promise<void>
  getSettledSlots(limit: number): Promise<AuctionSlot[]>

  // Nullifiers
  isNullifierUsed(nullifierHash: string): Promise<boolean>
  markNullifierUsed(nullifierHash: string): Promise<void>

  // Lifecycle
  initialize(): Promise<void>
  close(): Promise<void>

  // Testing
  reset(): Promise<void>
}
