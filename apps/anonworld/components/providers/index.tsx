'use client'

import { CustomToast, ToastProvider, isWeb } from '@anonworld/ui'
import { ToastViewport } from './ToastViewport'
import { Provider } from '../../../../packages/react/src'
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { base } from 'wagmi/chains'
import { ReactNode } from 'react'
import { ThemeProvider } from './theme'
import '@rainbow-me/rainbowkit/styles.css'

const config = getDefaultConfig({
  appName: 'anoncast',
  projectId: '302e299e8d6c292b6aeb9f313321e134',
  chains: [base],
  ssr: true,
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <Provider wagmiConfig={config}>
        <RainbowKitProvider>
          <ToastProvider
            swipeDirection="horizontal"
            duration={6000}
            native={isWeb ? [] : ['mobile']}
          >
            {children}
            <CustomToast />
            <ToastViewport />
          </ToastProvider>
        </RainbowKitProvider>
      </Provider>
    </ThemeProvider>
  )
}
