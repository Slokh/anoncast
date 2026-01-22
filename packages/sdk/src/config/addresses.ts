import { SUPPORTED_CHAIN_IDS, type SupportedChainId } from './chains'

// Contract addresses by chain ID
export type ContractAddresses = {
  anonToken: `0x${string}`
  pool?: `0x${string}`
  auction?: `0x${string}`
}

// Known contract addresses
const ADDRESSES: Record<SupportedChainId, ContractAddresses> = {
  [SUPPORTED_CHAIN_IDS.BASE_MAINNET]: {
    // Real $ANON token on Base mainnet
    anonToken: '0x0Db510e79909666d6dEc7f5e49370838c16D950f',
    // Pool and auction addresses will be set after mainnet deployment
    pool: undefined,
    auction: undefined,
  },
  [SUPPORTED_CHAIN_IDS.BASE_SEPOLIA]: {
    // Testnet token (to be deployed)
    anonToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    pool: undefined,
    auction: undefined,
  },
}

// Get addresses for a chain, with optional overrides
export function getContractAddresses(
  chainId: number,
  overrides?: Partial<ContractAddresses>
): ContractAddresses {
  const baseAddresses = ADDRESSES[chainId as SupportedChainId] || {
    anonToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    pool: undefined,
    auction: undefined,
  }

  return {
    ...baseAddresses,
    ...overrides,
  }
}

// Check if a chain is supported
export function isSupportedChain(chainId: number): chainId is SupportedChainId {
  return chainId in ADDRESSES
}
