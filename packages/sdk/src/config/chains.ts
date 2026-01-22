import { base, baseSepolia, type Chain } from 'viem/chains'

// Supported chain IDs
export const SUPPORTED_CHAIN_IDS = {
  BASE_MAINNET: 8453,
  BASE_SEPOLIA: 84532,
} as const

export type SupportedChainId = typeof SUPPORTED_CHAIN_IDS[keyof typeof SUPPORTED_CHAIN_IDS]

// Token decimals for $ANON
export const TOKEN_DECIMALS = 18

// Chain configuration
export type ChainConfig = {
  chain: Chain
  rpcUrl: string
  explorerUrl: string
  networkName: string
  isTestnet: boolean
}

// Default RPC URLs
const DEFAULT_RPC_URLS = {
  [SUPPORTED_CHAIN_IDS.BASE_MAINNET]: 'https://mainnet.base.org',
  [SUPPORTED_CHAIN_IDS.BASE_SEPOLIA]: 'https://sepolia.base.org',
} as const

// Explorer URLs
const EXPLORER_URLS = {
  [SUPPORTED_CHAIN_IDS.BASE_MAINNET]: 'https://basescan.org',
  [SUPPORTED_CHAIN_IDS.BASE_SEPOLIA]: 'https://sepolia.basescan.org',
} as const

// Network names
const NETWORK_NAMES = {
  [SUPPORTED_CHAIN_IDS.BASE_MAINNET]: 'Base',
  [SUPPORTED_CHAIN_IDS.BASE_SEPOLIA]: 'Base Sepolia',
} as const

// Get chain by ID
export function getChain(chainId: number): Chain {
  switch (chainId) {
    case SUPPORTED_CHAIN_IDS.BASE_MAINNET:
      return base
    case SUPPORTED_CHAIN_IDS.BASE_SEPOLIA:
      return baseSepolia
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`)
  }
}

// Get chain config with optional custom RPC
export function getChainConfig(
  chainId: number,
  customRpcUrl?: string
): ChainConfig {
  const chain = getChain(chainId)
  const rpcUrl = customRpcUrl || DEFAULT_RPC_URLS[chainId as SupportedChainId] || ''
  const explorerUrl = EXPLORER_URLS[chainId as SupportedChainId] || ''
  const networkName = NETWORK_NAMES[chainId as SupportedChainId] || 'Unknown'
  const isTestnet = chainId === SUPPORTED_CHAIN_IDS.BASE_SEPOLIA

  return {
    chain,
    rpcUrl,
    explorerUrl,
    networkName,
    isTestnet,
  }
}

// Helper to get explorer link
export function getExplorerLink(
  explorerUrl: string,
  type: 'tx' | 'address' | 'token',
  value: string
): string {
  return `${explorerUrl}/${type}/${value}`
}

// Detect chain from RPC URL (for local development)
export function detectChainFromRpcUrl(rpcUrl: string): Chain {
  if (rpcUrl.includes('sepolia')) {
    return baseSepolia
  }
  // Default to base (handles localhost forks of mainnet)
  return base
}
