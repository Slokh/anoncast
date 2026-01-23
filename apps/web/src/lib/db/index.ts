/**
 * Database module
 *
 * Exports a configured repository instance.
 * Switch implementations here when moving to a different database.
 */

import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { SQLiteAuctionRepository } from './sqlite'
import type { AuctionRepository } from './types'

export type { AuctionRepository, Bid, AuctionSlot } from './types'

// Use globalThis to ensure single instance across hot reloads
const globalStore = globalThis as unknown as {
  __auctionRepo?: AuctionRepository
  __auctionRepoInitialized?: boolean
}

function createRepository(): AuctionRepository {
  // In production, you might switch based on environment:
  // if (process.env.DATABASE_URL?.startsWith('postgres')) {
  //   return new PostgresAuctionRepository(process.env.DATABASE_URL)
  // }

  // Use absolute path for SQLite database
  const dbPath = process.env.AUCTION_DB_PATH || join(process.cwd(), 'data', 'auction.db')

  // Ensure directory exists
  try {
    mkdirSync(dirname(dbPath), { recursive: true })
  } catch {
    // Directory might already exist
  }

  return new SQLiteAuctionRepository(dbPath)
}

// Get or create the singleton repository
export function getRepository(): AuctionRepository {
  if (!globalStore.__auctionRepo) {
    globalStore.__auctionRepo = createRepository()
  }
  return globalStore.__auctionRepo
}

// Initialize the database (call once at app startup)
export async function initializeDatabase(): Promise<void> {
  if (globalStore.__auctionRepoInitialized) return

  const repo = getRepository()
  await repo.initialize()
  globalStore.__auctionRepoInitialized = true
}

// For testing - reset the repository
export function resetRepository(): void {
  if (globalStore.__auctionRepo) {
    globalStore.__auctionRepo.close()
  }
  globalStore.__auctionRepo = undefined
  globalStore.__auctionRepoInitialized = false
}
