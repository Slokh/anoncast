import { AnonWorldSDK } from '@anonworld/sdk'
import { createContext, useContext, ReactNode, useMemo } from 'react'
import { useCredentials } from '../hooks/use-credentials'

interface SDKContextValue {
  sdk: AnonWorldSDK
  credentials: ReturnType<typeof useCredentials>
}

export const SDKContext = createContext<SDKContextValue | undefined>(undefined)

export const SDKProvider = ({
  children,
  apiUrl,
}: { children: ReactNode; apiUrl?: string }) => {
  const sdk = useMemo(() => new AnonWorldSDK(apiUrl), [apiUrl])
  const credentials = useCredentials(sdk)

  return (
    <SDKContext.Provider value={{ sdk, credentials }}>{children}</SDKContext.Provider>
  )
}

export const useSDK = () => {
  const context = useContext(SDKContext)
  if (!context) {
    throw new Error('useSDK must be used within an SDKProvider')
  }
  return context
}
