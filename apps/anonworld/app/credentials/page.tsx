'use client'

import { CredentialDisplay, NewCredential, useSDK } from '@anonworld/react'
import { Text, View, XStack, YStack } from '@anonworld/ui'
import { useConnectModal } from '@rainbow-me/rainbowkit'

export default function Credentials() {
  const { credentials } = useSDK()
  const { connectModalOpen, openConnectModal } = useConnectModal()

  const sortedCredentials = credentials.credentials.sort((a, b) => {
    return new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime()
  })

  return (
    <View maxWidth={700} mx="auto" my="$3" gap="$3">
      <XStack ai="center" jc="space-between">
        <Text fos="$2" fow="400" color="$color11">
          {`${sortedCredentials.length} Credentials`}
        </Text>
        <NewCredential isConnecting={connectModalOpen} connectWallet={openConnectModal} />
      </XStack>
      <YStack gap="$4">
        {sortedCredentials.map((credential) => (
          <CredentialDisplay key={credential.id} credential={credential} />
        ))}
      </YStack>
    </View>
  )
}
