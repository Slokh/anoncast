import { Credential } from '../../../types'
import { formatAmount } from '../../../utils'
import { Coins } from '@tamagui/lucide-icons'
import { Badge } from '../../badge'
import { useToken } from '../../../hooks'
import { formatUnits } from 'viem/utils'

export function CredentialBadge({ credential }: { credential: Credential }) {
  if (!credential.metadata?.balance) return null

  return <ERC20CredentialBadge credential={credential} />
}

function ERC20CredentialBadge({ credential }: { credential: Credential }) {
  const { data } = useToken({
    chainId: Number(credential.metadata.chainId),
    address: credential.metadata.tokenAddress,
  })

  const symbol = data?.attributes.symbol
  const implementation = data?.attributes.implementations[0]
  const amount = Number.parseFloat(
    formatUnits(BigInt(credential.metadata.balance), implementation?.decimals ?? 18)
  )

  return <Badge icon={<Coins size={12} />}>{`${formatAmount(amount)} ${symbol}`}</Badge>
}
