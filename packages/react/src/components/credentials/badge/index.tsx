import { Credential } from '../../../types'
import { formatAmount } from '../../../utils'
import { Coins } from '@tamagui/lucide-icons'
import { Badge } from '../../badge'
import { useERC20 } from '../../../hooks'

export function CredentialBadge({ credential }: { credential: Credential }) {
  if (!credential.metadata?.balance) return null

  return <ERC20CredentialBadge credential={credential} />
}

function ERC20CredentialBadge({ credential }: { credential: Credential }) {
  const { symbol, amount } = useERC20({
    chainId: Number(credential.metadata.chainId),
    address: credential.metadata.tokenAddress,
    amount: BigInt(credential.metadata.balance),
  })

  return <Badge icon={<Coins size={12} />}>{`${formatAmount(amount)} ${symbol}`}</Badge>
}
