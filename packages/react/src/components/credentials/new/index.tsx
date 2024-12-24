import { NewCredentialProvider } from './context'
import { NewCredentialDialog } from './dialog'

export function NewCredential({
  connectWallet,
  isConnecting,
}: {
  connectWallet?: () => void
  isConnecting: boolean
}) {
  return (
    <NewCredentialProvider isConnecting={isConnecting} connectWallet={connectWallet}>
      <NewCredentialDialog />
    </NewCredentialProvider>
  )
}
