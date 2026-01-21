'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { base, baseSepolia, type Chain } from 'wagmi/chains'
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { type ReactNode, useState } from 'react'
import '@rainbow-me/rainbowkit/styles.css'

const IS_TESTNET = process.env.NEXT_PUBLIC_TESTNET === 'true'
const RPC_URL = process.env.NEXT_PUBLIC_TESTNET_RPC_URL || ''
const isLocalhost = RPC_URL.includes('127.0.0.1') || RPC_URL.includes('localhost')

// Local Anvil chain for development
const localhost: Chain = {
  id: 31337,
  name: 'Localhost',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: [RPC_URL || 'http://127.0.0.1:8545'] },
  },
}

// Select chain based on environment
const getChains = (): readonly [Chain, ...Chain[]] => {
  if (IS_TESTNET) {
    return isLocalhost ? [localhost] : [baseSepolia]
  }
  return [base]
}

const config = getDefaultConfig({
  appName: 'Anon',
  projectId: '302e299e8d6c292b6aeb9f313321e134',
  chains: getChains(),
  ssr: true,
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
