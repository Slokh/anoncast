/**
 * SQLite implementation of AuctionRepository
 *
 * Uses better-sqlite3 for fast, synchronous operations.
 * Data is persisted to a file.
 */

import Database from 'better-sqlite3'
import type { AuctionRepository, Bid, AuctionSlot } from './types'

export class SQLiteAuctionRepository implements AuctionRepository {
  private db: Database.Database

  constructor(dbPath: string = 'auction.db') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
  }

  async initialize(): Promise<void> {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bids (
        id TEXT PRIMARY KEY,
        slot_id INTEGER NOT NULL,
        bid_amount TEXT NOT NULL,
        content TEXT NOT NULL,
        images TEXT,
        embeds TEXT,
        proof TEXT NOT NULL,
        nullifier_hash TEXT NOT NULL,
        claim_commitment TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_bids_slot_id ON bids(slot_id);
      CREATE INDEX IF NOT EXISTS idx_bids_slot_amount ON bids(slot_id, bid_amount DESC);

      CREATE TABLE IF NOT EXISTS slots (
        slot_id INTEGER PRIMARY KEY,
        winning_bid_id TEXT,
        settled INTEGER NOT NULL DEFAULT 0,
        cast_hash TEXT,
        tweet_id TEXT
      );

      CREATE TABLE IF NOT EXISTS nullifiers (
        nullifier_hash TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
    `)
  }

  async close(): Promise<void> {
    this.db.close()
  }

  async reset(): Promise<void> {
    this.db.exec(`
      DELETE FROM bids;
      DELETE FROM slots;
      DELETE FROM nullifiers;
    `)
  }

  // Bids

  async createBid(bidData: Omit<Bid, 'id' | 'createdAt'>): Promise<Bid> {
    const id = crypto.randomUUID()
    const createdAt = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO bids (id, slot_id, bid_amount, content, images, embeds, proof, nullifier_hash, claim_commitment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      bidData.slotId,
      bidData.bidAmount,
      bidData.content,
      bidData.images ? JSON.stringify(bidData.images) : null,
      bidData.embeds ? JSON.stringify(bidData.embeds) : null,
      JSON.stringify(bidData.proof),
      bidData.nullifierHash,
      bidData.claimCommitment,
      createdAt
    )

    return {
      ...bidData,
      id,
      createdAt,
    }
  }

  async getBidById(id: string): Promise<Bid | null> {
    const stmt = this.db.prepare('SELECT * FROM bids WHERE id = ?')
    const row = stmt.get(id) as BidRow | undefined
    return row ? this.rowToBid(row) : null
  }

  async getBidsForSlot(slotId: number): Promise<Bid[]> {
    const stmt = this.db.prepare('SELECT * FROM bids WHERE slot_id = ?')
    const rows = stmt.all(slotId) as BidRow[]
    // Sort by bid amount in JS since SQLite doesn't handle big integers well
    return rows
      .map((row) => this.rowToBid(row))
      .sort((a, b) => {
        const aAmount = BigInt(a.bidAmount)
        const bAmount = BigInt(b.bidAmount)
        return bAmount > aAmount ? 1 : bAmount < aAmount ? -1 : 0
      })
  }

  async getHighestBidForSlot(slotId: number): Promise<Bid | null> {
    const bids = await this.getBidsForSlot(slotId)
    return bids.length > 0 ? bids[0] : null
  }

  // Slots

  async getSlot(slotId: number): Promise<AuctionSlot> {
    const stmt = this.db.prepare('SELECT * FROM slots WHERE slot_id = ?')
    const row = stmt.get(slotId) as SlotRow | undefined

    if (row) {
      return this.rowToSlot(row)
    }

    // Create slot if it doesn't exist
    const insertStmt = this.db.prepare(
      'INSERT OR IGNORE INTO slots (slot_id, settled) VALUES (?, 0)'
    )
    insertStmt.run(slotId)

    return {
      slotId,
      settled: false,
    }
  }

  async settleSlot(
    slotId: number,
    winningBidId: string,
    castHash: string,
    tweetId?: string
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO slots (slot_id, winning_bid_id, settled, cast_hash, tweet_id)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(slot_id) DO UPDATE SET
        winning_bid_id = excluded.winning_bid_id,
        settled = 1,
        cast_hash = excluded.cast_hash,
        tweet_id = excluded.tweet_id
    `)
    stmt.run(slotId, winningBidId, castHash, tweetId ?? null)

    // Mark the winning bid's nullifier as used
    const bid = await this.getBidById(winningBidId)
    if (bid) {
      await this.markNullifierUsed(bid.nullifierHash)
    }
  }

  async getSettledSlots(limit: number): Promise<AuctionSlot[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM slots WHERE settled = 1 ORDER BY slot_id DESC LIMIT ?'
    )
    const rows = stmt.all(limit) as SlotRow[]
    return rows.map((row) => this.rowToSlot(row))
  }

  // Nullifiers

  async isNullifierUsed(nullifierHash: string): Promise<boolean> {
    const stmt = this.db.prepare('SELECT 1 FROM nullifiers WHERE nullifier_hash = ?')
    const row = stmt.get(nullifierHash)
    return row !== undefined
  }

  async markNullifierUsed(nullifierHash: string): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO nullifiers (nullifier_hash, created_at) VALUES (?, ?)'
    )
    stmt.run(nullifierHash, Date.now())
  }

  // Helpers

  private rowToBid(row: BidRow): Bid {
    return {
      id: row.id,
      slotId: row.slot_id,
      bidAmount: row.bid_amount,
      content: row.content,
      images: row.images ? JSON.parse(row.images) : undefined,
      embeds: row.embeds ? JSON.parse(row.embeds) : undefined,
      proof: JSON.parse(row.proof),
      nullifierHash: row.nullifier_hash,
      claimCommitment: row.claim_commitment,
      createdAt: row.created_at,
    }
  }

  private rowToSlot(row: SlotRow): AuctionSlot {
    return {
      slotId: row.slot_id,
      winningBidId: row.winning_bid_id ?? undefined,
      settled: row.settled === 1,
      castHash: row.cast_hash ?? undefined,
      tweetId: row.tweet_id ?? undefined,
    }
  }
}

// Row types for SQLite results
type BidRow = {
  id: string
  slot_id: number
  bid_amount: string
  content: string
  images: string | null
  embeds: string | null
  proof: string
  nullifier_hash: string
  claim_commitment: string
  created_at: number
}

type SlotRow = {
  slot_id: number
  winning_bid_id: string | null
  settled: number
  cast_hash: string | null
  tweet_id: string | null
}
