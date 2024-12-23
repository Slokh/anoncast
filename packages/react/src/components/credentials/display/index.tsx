import { Credential } from '../../../types'
import { Text, View, XStack, YStack } from '@anonworld/ui'
import { chains, timeAgo, toHslColors } from '../../../utils'
import { formatHexId } from '../../../utils'
import { Badge } from '../../badge'
import { CredentialActions } from './actions'
import { useERC20 } from '../../../hooks'
import { extractChain } from 'viem/utils'

export function CredentialDisplay({ credential }: { credential: Credential }) {
  const id = formatHexId(credential.id)
  const { background, color } = toHslColors(id)

  return (
    <YStack
      theme="surface1"
      bg="$background"
      bc="$borderColor"
      bbw="$0.5"
      p="$3"
      gap="$4"
      $gtXs={{
        br: '$4',
        bw: '$0.5',
      }}
      f={1}
    >
      <XStack ai="center" gap="$2">
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
        <Badge>ERC20 Balance</Badge>
        <Badge>{timeAgo(credential.verified_at)}</Badge>
      </XStack>
      <ERC20CredentialDisplay credential={credential} />
      <View position="absolute" top="$2" right="$3">
        <CredentialActions credential={credential} />
      </View>
    </YStack>
  )
}

function ERC20CredentialDisplay({ credential }: { credential: Credential }) {
  const { symbol, amount } = useERC20({
    chainId: Number(credential.metadata.chainId),
    address: credential.metadata.tokenAddress,
    amount: BigInt(credential.metadata.balance),
  })

  return (
    <XStack gap="$6">
      {[
        {
          label: 'Chain',
          value: extractChain({ chains, id: Number(credential.metadata.chainId) as any })
            .name,
        },
        { label: 'Token', value: symbol },
        { label: 'Balance', value: amount.toLocaleString() },
      ].map(({ label, value }) => (
        <YStack key={label}>
          <Text fow="600">{value}</Text>
          <Text fos="$1" fow="400" color="$color11" textTransform="uppercase">
            {label}
          </Text>
        </YStack>
      ))}
    </XStack>
  )
}
