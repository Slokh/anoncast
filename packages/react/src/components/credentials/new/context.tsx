import { createContext, useContext, useEffect, useState } from 'react'
import { CredentialType, FungiblePosition } from '../../../types'

interface NewCredentialContextValue {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  credentialType: CredentialType
  setCredentialType: (credentialType: CredentialType) => void
  connectWallet?: () => void
  isConnecting: boolean
  token: FungiblePosition | undefined
  setToken: (token?: FungiblePosition) => void
  balance: number
  setBalance: (balance: number) => void
}

const NewCredentialContext = createContext<NewCredentialContextValue | null>(null)

export function NewCredentialProvider({
  connectWallet,
  isConnecting,
  children,
}: {
  connectWallet?: () => void
  isConnecting: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [credentialType, setCredentialType] = useState<CredentialType>(
    CredentialType.ERC20_BALANCE
  )
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)

  const [token, setToken] = useState<FungiblePosition>()
  const [balance, setBalance] = useState<number>(0)

  const handleConnectWallet = () => {
    if (!connectWallet) return
    setIsOpen(false)
    setIsConnectingWallet(true)
    connectWallet()
  }

  useEffect(() => {
    if (isConnectingWallet && !isConnecting) {
      setIsConnectingWallet(false)
      setIsOpen(true)
    }
  }, [isConnecting])

  return (
    <NewCredentialContext.Provider
      value={{
        isOpen,
        setIsOpen,
        connectWallet: handleConnectWallet,
        credentialType,
        setCredentialType,
        isConnecting,
        token,
        setToken,
        balance,
        setBalance,
      }}
    >
      {children}
    </NewCredentialContext.Provider>
  )
}

export function useNewCredential() {
  const context = useContext(NewCredentialContext)
  if (!context) {
    throw new Error('useNewCredential must be used within a NewCredentialProvider')
  }
  return context
}
