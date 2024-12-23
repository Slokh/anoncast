'use client'

import { CredentialComposer, CredentialDisplay, useSDK } from '@anonworld/react'
import { Text, View, XStack, YStack } from '@anonworld/ui'

export default function Credentials() {
  const { credentials } = useSDK()

  const sortedCredentials = credentials.credentials.sort((a, b) => {
    return new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime()
  })

  return (
    <View maxWidth={700} mx="auto" my="$3" gap="$3">
      <XStack ai="center" jc="space-between">
        <Text fos="$2" fow="400" color="$color11">
          {`${sortedCredentials.length} Credentials`}
        </Text>
        <CredentialComposer />
      </XStack>
      <YStack gap="$4">
        {sortedCredentials.map((credential) => (
          <CredentialDisplay key={credential.id} credential={credential} />
        ))}
      </YStack>
    </View>
  )
}
