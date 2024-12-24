import { TamaguiProvider, type TamaguiProviderProps, config } from '@anonworld/ui'
import { SDKProvider } from './sdk'
import { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
export { useSDK } from './sdk'

const queryClient = new QueryClient()

export function Provider({
  children,
  wagmiConfig,
  ...rest
}: Omit<TamaguiProviderProps, 'config'> & { wagmiConfig: any }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SDKProvider apiUrl={process.env.NEXT_PUBLIC_API_URL}>
          <TamaguiProvider config={config} defaultTheme="dark" disableRootThemeClass>
            {children}
          </TamaguiProvider>
        </SDKProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
