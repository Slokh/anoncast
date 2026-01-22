// Re-export from env.ts for backwards compatibility
export {
  IS_LOCAL,
  ACTIVE_CHAIN,
  CHAIN_ID,
  RPC_URL,
  CHAIN_CONFIG,
  NETWORK_NAME,
  EXPLORER_URL,
  CONTRACTS,
  TOKEN_DECIMALS,
  getExplorerLink,
} from './env'

// Also export the chain type
export type { Chain } from 'viem/chains'
