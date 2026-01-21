'use client'

import Image from 'next/image'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatUnits } from 'viem'
import { CONTRACTS, IS_TESTNET, NETWORK_NAME } from '@/config/chains'

const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

function formatBalance(balance: bigint): string {
  const formatted = Number(formatUnits(balance, 18))
  if (formatted >= 1_000_000) {
    return (formatted / 1_000_000).toFixed(2) + 'M'
  }
  if (formatted >= 1_000) {
    return (formatted / 1_000).toFixed(1) + 'K'
  }
  return formatted.toFixed(0)
}

export function Header() {
  const { address, isConnected } = useAccount()

  const { data: balance } = useReadContract({
    address: CONTRACTS.ANON_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!CONTRACTS.ANON_TOKEN,
    },
  })

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background">
      {/* Testnet Banner */}
      {IS_TESTNET && (
        <div className="bg-yellow-500/20 px-4 py-1 text-center text-xs font-medium text-yellow-600">
          {NETWORK_NAME} Testnet
        </div>
      )}

      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <Image src="/anon.png" alt="Anon" width={28} height={28} className="rounded-full" />
          <span className="text-sm font-semibold">ANON</span>
        </div>

        {/* Right: Wallet / Balance */}
        <div className="flex items-center gap-3">
          {isConnected && balance !== undefined && (
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
              <Image src="/anon.png" alt="ANON" width={16} height={16} className="rounded-full" />
              <span className="text-sm font-medium">{formatBalance(balance)}</span>
            </div>
          )}

          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
              const connected = mounted && account && chain

              return (
                <button
                  onClick={connected ? openAccountModal : openConnectModal}
                  className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  {connected
                    ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
                    : 'Connect'}
                </button>
              )
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </header>
  )
}
