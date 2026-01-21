import { base, baseSepolia, type Chain } from 'viem/chains'

// Determine which network to use based on environment
export const IS_TESTNET = process.env.NEXT_PUBLIC_TESTNET === 'true'

// Check if using local Anvil
const isLocalhost = process.env.NEXT_PUBLIC_TESTNET_RPC_URL?.includes('127.0.0.1') ||
                    process.env.NEXT_PUBLIC_TESTNET_RPC_URL?.includes('localhost')

// Local Anvil chain definition
const localhost: Chain = {
  id: 31337,
  name: 'Localhost',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
}

// Active chain - use localhost if RPC URL points to 127.0.0.1
export const ACTIVE_CHAIN = IS_TESTNET
  ? (isLocalhost ? localhost : baseSepolia)
  : base

// Chain ID
export const CHAIN_ID = ACTIVE_CHAIN.id

// Contract addresses
export const CONTRACTS = {
  // $ANON token (or test token on testnet)
  ANON_TOKEN: IS_TESTNET
    ? (process.env.NEXT_PUBLIC_TESTNET_ANON_TOKEN as `0x${string}`)
    : ('0x0Db510e79909666d6dEc7f5e49370838c16D950f' as const),

  // AnonPool contract
  POOL: (process.env.NEXT_PUBLIC_POOL_CONTRACT as `0x${string}`) || undefined,

  // Auction/Spender contract
  AUCTION: (process.env.NEXT_PUBLIC_AUCTION_CONTRACT as `0x${string}`) || undefined,
}

// RPC URLs
export const RPC_URL = IS_TESTNET
  ? process.env.NEXT_PUBLIC_TESTNET_RPC_URL || 'https://sepolia.base.org'
  : process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'

// Block explorer
export const EXPLORER_URL = IS_TESTNET
  ? (isLocalhost ? '' : 'https://sepolia.basescan.org')
  : 'https://basescan.org'

// Token decimals
export const TOKEN_DECIMALS = 18

// Helper to get explorer link
export function getExplorerLink(type: 'tx' | 'address' | 'token', value: string): string {
  if (!EXPLORER_URL) return '#' // No explorer for localhost
  return `${EXPLORER_URL}/${type}/${value}`
}

// Display name for the network
export const NETWORK_NAME = IS_TESTNET
  ? (isLocalhost ? 'Localhost' : 'Base Sepolia')
  : 'Base'
