// Environment variable configuration for the web app
// This file reads NEXT_PUBLIC_* env vars and exports configured values

import { base, type Chain } from 'viem/chains'
import {
  getChainConfig,
  TOKEN_DECIMALS as SDK_TOKEN_DECIMALS,
  type ChainConfig,
  type ContractAddresses,
} from '@anon/sdk/config'

// RPC URL from env (local-dev.sh sets this to http://127.0.0.1:8545)
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'

// Detect if running locally (Anvil fork)
export const IS_LOCAL = RPC_URL.includes('127.0.0.1') || RPC_URL.includes('localhost')

// Always use Base chain config (Anvil fork preserves chain ID 8453)
export const ACTIVE_CHAIN: Chain = base
export const CHAIN_ID = base.id

// Get chain config with custom RPC
export const CHAIN_CONFIG: ChainConfig = getChainConfig(CHAIN_ID, RPC_URL)

// Network display name
export const NETWORK_NAME = IS_LOCAL ? 'Base (Local)' : 'Base'

// Block explorer (local fork still uses basescan for tx lookup)
export const EXPLORER_URL = 'https://basescan.org'

// $ANON token address on Base mainnet (same for local fork)
const ANON_TOKEN_ADDRESS = '0x0Db510e79909666d6dEc7f5e49370838c16D950f' as const

// Contract addresses from env
export const CONTRACTS: ContractAddresses & {
  ANON_TOKEN: `0x${string}`
  POOL: `0x${string}` | undefined
  AUCTION: `0x${string}` | undefined
  GATEWAY: `0x${string}` | undefined
} = {
  anonToken: ANON_TOKEN_ADDRESS,
  pool: (process.env.NEXT_PUBLIC_POOL_CONTRACT as `0x${string}`) || undefined,
  auction: (process.env.NEXT_PUBLIC_AUCTION_CONTRACT as `0x${string}`) || undefined,
  gateway: (process.env.NEXT_PUBLIC_GATEWAY_CONTRACT as `0x${string}`) || undefined,

  // Legacy aliases
  get ANON_TOKEN() {
    return this.anonToken
  },
  get POOL() {
    return this.pool
  },
  get AUCTION() {
    return this.auction
  },
  get GATEWAY() {
    return this.gateway
  },
}

// Token decimals
export const TOKEN_DECIMALS = SDK_TOKEN_DECIMALS

// Helper to get explorer link
export function getExplorerLink(type: 'tx' | 'address' | 'token', value: string): string {
  return `${EXPLORER_URL}/${type}/${value}`
}
