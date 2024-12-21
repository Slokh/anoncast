import { Credential } from '../../types'
import { formatAddress, formatAmount } from '../../utils'
import { Coins } from '@tamagui/lucide-icons'
import { erc20Abi, formatEther } from 'viem'
import { useReadContract } from 'wagmi'
import { Text, View } from '@anonworld/ui'

export function CredentialBadge({ credential }: { credential: Credential }) {
  if (!credential.metadata?.balance) return null

  return <ERC20CredentialBadge credential={credential} />
}

function ERC20CredentialBadge({ credential }: { credential: Credential }) {
  const { data: symbol } = useReadContract({
    chainId: Number(credential.metadata.chainId),
    address: credential.metadata.tokenAddress,
    abi: erc20Abi,
    functionName: 'symbol',
  })

  const value = Number.parseFloat(formatEther(BigInt(credential.metadata.balance)))
  const ticker = symbol || formatAddress(credential.metadata.tokenAddress)

  return <Badge icon={<Coins size={12} />}>{`${formatAmount(value)} ${ticker}`}</Badge>
}

function Badge({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <View
      theme="surface3"
      bg="$background"
      bc="$borderColor"
      bw="$0.25"
      br="$12"
      px="$2"
      py="$1.5"
      fd="row"
      ai="center"
      gap="$2"
    >
      {icon}
      <Text fos="$1">{children}</Text>
    </View>
  )
}
