'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatUnits } from 'viem'
import { CONTRACTS, IS_TESTNET, NETWORK_NAME } from '@/config/chains'
import { usePrivacyWallet } from '@/providers/privacy-wallet'

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
  const { isUnlocked, isLoading: walletLoading, isInitializing, unlock, sync, clearStoredSignature } = usePrivacyWallet()

  // Track if user initiated connect flow (to trigger unlock after wallet connects)
  const [pendingUnlock, setPendingUnlock] = useState(false)

  // Only show as "fully connected" when privacy wallet is unlocked
  const isFullyConnected = isConnected && isUnlocked

  const { data: balance } = useReadContract({
    address: CONTRACTS.ANON_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!CONTRACTS.ANON_TOKEN,
    },
  })

  // Handle unlock after wallet connects
  useEffect(() => {
    if (pendingUnlock && isConnected && !isUnlocked && !walletLoading) {
      setPendingUnlock(false)
      unlock().then((success) => {
        if (success) {
          sync()
        }
      })
    }
  }, [pendingUnlock, isConnected, isUnlocked, walletLoading, unlock, sync])

  // Handle connect button click
  const handleConnectClick = useCallback(
    (openConnectModal: () => void) => {
      // Always clear stored signature on manual connect to force fresh signature
      clearStoredSignature()

      if (isConnected && !isUnlocked) {
        // Wallet connected but not unlocked - trigger unlock directly
        unlock().then((success) => {
          if (success) {
            sync()
          }
        })
      } else if (!isConnected) {
        // Not connected - open RainbowKit and set pending unlock
        setPendingUnlock(true)
        openConnectModal()
      }
    },
    [isConnected, isUnlocked, unlock, sync, clearStoredSignature]
  )

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
          {isFullyConnected && balance !== undefined && (
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
              <Image src="/anon.png" alt="ANON" width={16} height={16} className="rounded-full" />
              <span className="text-sm font-medium">{formatBalance(balance)}</span>
            </div>
          )}

          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
              // Only show as connected if privacy wallet is also unlocked
              const connected = mounted && account && chain && isUnlocked

              // Don't render anything while initializing
              if (isInitializing) {
                return null
              }

              return (
                <button
                  onClick={() =>
                    connected ? openAccountModal() : handleConnectClick(openConnectModal)
                  }
                  disabled={walletLoading}
                  className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
                >
                  {walletLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      <span>Connecting</span>
                    </span>
                  ) : connected ? (
                    `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
                  ) : (
                    'Connect'
                  )}
                </button>
              )
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </header>
  )
}
