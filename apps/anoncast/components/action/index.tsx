import { useBalance } from '@/lib/hooks/use-balance'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { CircleCheckIcon } from 'lucide-react'
import { CircleXIcon } from 'lucide-react'
import { CircleMinusIcon } from 'lucide-react'
import { CreatePost } from '../create-post'
import { POST_AMOUNT, PROMOTE_AMOUNT, DELETE_AMOUNT } from '@/lib/utils'
import { useAccount } from 'wagmi'
import { Separator } from '../ui/separator'

export default function ActionComponent({
  variant = 'post',
  description,
  requirements,
}: {
  variant?: 'post' | 'launch'
  title?: string
  description?: string
  requirements?: Array<{ amount: number; label: string }>
}) {
  const { address } = useAccount()
  const { data, isLoading } = useBalance()

  const FARCASTER_POST = BigInt(POST_AMOUNT) / BigInt(10 ** 18)
  const TWITTER_PROMOTE = BigInt(PROMOTE_AMOUNT) / BigInt(10 ** 18)
  const DELETE_POST = BigInt(DELETE_AMOUNT) / BigInt(10 ** 18)

  // Default values for post variant
  const defaultDescription =
    "Rumours are made anonymous using zk proofs. Do not post porn, doxes, shills, or threats. This is for sharing rumours and gossip - not enabling bad behaviour."
  const defaultRequirements = [
    { amount: Number(FARCASTER_POST), label: 'Post to @rumour' },
    {
      amount: Number(TWITTER_PROMOTE),
      label: 'Promote posts to X/Twitter',
    },
    { amount: Number(DELETE_POST), label: 'Delete Rumours' },
  ]

  const displayDescription = description || defaultDescription
  const displayRequirements = requirements || defaultRequirements

  return (
    <Alert className="flex flex-col px-6 py-8 gap-4 bg-gradient-to-br from-primary/30 to-secondary/30 rounded-2xl border-none shadow-lg shadow-black-500/50">
      <AlertTitle className="font-semibold text-3xl">
        <span className="block">I heard a rumour... 👀</span>
        <span className="block">Gossip on Farcaster</span>
      </AlertTitle>
      <AlertDescription>
        <p className="text-zinc-100">{displayDescription}</p>
        <br />
        <p className="text-zinc-400">Holder requirements:</p>
        <ul className="flex flex-col gap-1 mt-3">
          {displayRequirements.map((req, index) => (
            <TokenRequirement
              key={index}
              tokenAmount={data}
              tokenNeeded={BigInt(req.amount)}
              string={req.label}
              isConnected={!!address && !isLoading}
            />
          ))}
        </ul>
      </AlertDescription>

      <div className="flex flex-row gap-2 justify-between ">
        <div className="flex flex-row gap-4">
          <a
            href="https://x.com/anoncast_"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm decoration-dotted underline font-medium"
          >
            <span className="hidden sm:inline">X/Twitter</span>
            <img src="/x.svg" alt="X/Twitter" className="w-4 h-4 sm:hidden invert" />
          </a>

          <a
            href="https://warpcast.com/anoncast"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm decoration-dotted underline font-medium"
          >
            <span className="hidden sm:inline">Farcaster</span>
            <img
              src="/farcaster.svg"
              alt="Farcaster"
              className="w-4 h-4 sm:hidden invert"
            />
          </a>
          <a
            href="https://github.com/Slokh/anoncast"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm decoration-dotted underline font-medium"
          >
            Github
          </a>
        </div>
      </div>
      <Separator />
      <CreatePost variant={variant} />
    </Alert>
  )
}

function TokenRequirement({
  tokenAmount,
  tokenNeeded,
  oldTokenNeeded,
  string,
  isConnected,
}: {
  tokenAmount: bigint | undefined
  tokenNeeded: bigint
  oldTokenNeeded?: bigint
  string: string
  isConnected: boolean
}) {
  const tokenAmountInTokens = tokenAmount ? tokenAmount / BigInt(10 ** 18) : BigInt(0)

  return (
    <li className="flex flex-row items-center gap-2 font-medium text-xs sm:text-base">
      {isConnected ? (
        tokenAmountInTokens >= tokenNeeded ? (
          <CircleCheckIcon className="text-green-500 w-4 h-4" />
        ) : (
          <CircleXIcon className="text-red-500 w-4 h-4" />
        )
      ) : (
        <CircleMinusIcon className="text-gray-400 w-4 h-4" />
      )}
      <p>
        {!!oldTokenNeeded && (
          <>
            <span className="line-through text-zinc-500">{`${oldTokenNeeded.toLocaleString()}`}</span>
            <span>{'  '}</span>
          </>
        )}
        {`${tokenNeeded.toLocaleString()} $ANON: ${string}`}
      </p>
    </li>
  )
}
