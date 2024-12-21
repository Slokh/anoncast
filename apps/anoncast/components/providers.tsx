'use client'

import '@rainbow-me/rainbowkit/styles.css'

import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { base } from 'wagmi/chains'
import { ThemeProvider } from 'next-themes'
import { Provider } from '../../../packages/react/src'

const config = getDefaultConfig({
  appName: 'anoncast',
  projectId: '302e299e8d6c292b6aeb9f313321e134',
  chains: [base],
  ssr: true,
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      forcedTheme="dark"
      disableTransitionOnChange
    >
      <Provider wagmiConfig={config}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </Provider>
    </ThemeProvider>
  )
}
