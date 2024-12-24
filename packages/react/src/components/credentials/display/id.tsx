import { formatHexId, toHslColors } from '../../../utils'
import { Text, View } from '@anonworld/ui'
import { Credential } from '../../../types'

export function CredentialId({ credential }: { credential: Credential }) {
  const id = formatHexId(credential.id)
  const { background, color } = toHslColors(id)
  return (
    <View
      theme="surface3"
      bg={background}
      br="$12"
      px="$2"
      py="$1.5"
      fd="row"
      ai="center"
      gap="$1.5"
      alignSelf="flex-start"
    >
      <Text fos="$1" color={color} fow="500">
        {id}
      </Text>
    </View>
  )
}
