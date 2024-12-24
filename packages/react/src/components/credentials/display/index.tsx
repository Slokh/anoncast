import { Credential } from '../../../types'
import { Image, Text, View, XStack, YStack } from '@anonworld/ui'
import { chains, timeAgo } from '../../../utils'
import { Badge } from '../../badge'
import { CredentialActions } from './actions'
import { useToken } from '../../../hooks'
import { extractChain, formatUnits } from 'viem/utils'
import { CredentialId } from './id'

export function CredentialDisplay({ credential }: { credential: Credential }) {
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
        <CredentialId credential={credential} />
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
  const { data } = useToken({
    chainId: Number(credential.metadata.chainId),
    address: credential.metadata.tokenAddress,
  })

  const symbol = data?.attributes.symbol
  const implementation = data?.attributes.implementations[0]
  const amount = Number.parseFloat(
    formatUnits(BigInt(credential.metadata.balance), implementation?.decimals ?? 18)
  )

  return (
    <XStack>
      {[
        { label: 'Token', value: symbol, image: data?.attributes.icon.url },
        { label: 'Balance', value: amount.toLocaleString() },
        {
          label: 'Chain',
          value: extractChain({ chains, id: Number(credential.metadata.chainId) as any })
            .name,
        },
      ].map(({ label, value, image }) => (
        <YStack key={label} gap="$1" minWidth="$14">
          <XStack ai="center" gap="$2">
            {image && <Image src={image} w={16} h={16} />}
            <Text fow="600">{value}</Text>
          </XStack>
          <Text fos="$1" fow="400" color="$color11" textTransform="uppercase">
            {label}
          </Text>
        </YStack>
      ))}
    </XStack>
  )
}
