'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { type ReactNode, useState } from 'react'
import '@rainbow-me/rainbowkit/styles.css'

const IS_TESTNET = process.env.NEXT_PUBLIC_TESTNET === 'true'

const config = getDefaultConfig({
  appName: 'Anon',
  projectId: '302e299e8d6c292b6aeb9f313321e134',
  chains: IS_TESTNET ? [baseSepolia] : [base],
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
