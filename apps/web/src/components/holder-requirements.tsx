'use client'

import { useAccount, useReadContract } from 'wagmi'
import { Check, X } from 'lucide-react'

const ANON_TOKEN = '0x0Db510e79909666d6dEc7f5e49370838c16D950f'
const POST_BALANCE = 5000n * 10n ** 18n
const PROMOTE_BALANCE = 2000000n * 10n ** 18n

const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

function RequirementIcon({ met, loggedIn }: { met: boolean; loggedIn: boolean }) {
  if (!loggedIn) {
    return <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
  }
  if (met) {
    return <Check className="h-4 w-4 text-green-500" />
  }
  return <X className="h-4 w-4 text-red-500" />
}

export function HolderRequirements() {
  const { address, isConnected } = useAccount()

  const { data: balance } = useReadContract({
    address: ANON_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const canPost = balance !== undefined && balance >= POST_BALANCE
  const canPromote = balance !== undefined && balance >= PROMOTE_BALANCE

  return (
    <>
      <p className="mt-4 text-sm text-muted-foreground">Holder requirements:</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        <li className="flex items-center gap-2">
          <RequirementIcon met={canPost} loggedIn={isConnected} />
          <span className={isConnected && canPost ? 'text-foreground' : ''}>
            5,000 $ANON: Post to Farcaster
          </span>
        </li>
        <li className="flex items-center gap-2">
          <RequirementIcon met={canPromote} loggedIn={isConnected} />
          <span className={isConnected && canPromote ? 'text-foreground' : ''}>
            2,000,000 $ANON: Crosspost to X
          </span>
        </li>
      </ul>
    </>
  )
}
