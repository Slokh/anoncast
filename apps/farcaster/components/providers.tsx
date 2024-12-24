'use client'

import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { ThemeProvider } from 'next-themes'
import { frameConnector } from '@/lib/connector'
import { Provider } from '@anonworld/react'

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [frameConnector()],
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
      <Provider wagmiConfig={config}>{children}</Provider>
    </ThemeProvider>
  )
}
