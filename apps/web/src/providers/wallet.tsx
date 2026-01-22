'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { base, type Chain } from 'wagmi/chains'
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { type ReactNode, useState } from 'react'
import '@rainbow-me/rainbowkit/styles.css'

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'
const isLocal = RPC_URL.includes('127.0.0.1') || RPC_URL.includes('localhost')

// Base chain config - override RPC for local development
const baseChain: Chain = isLocal
  ? {
      ...base,
      rpcUrls: {
        default: { http: [RPC_URL] },
      },
    }
  : base

const config = getDefaultConfig({
  appName: 'Anon',
  projectId: '302e299e8d6c292b6aeb9f313321e134',
  chains: [baseChain],
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
