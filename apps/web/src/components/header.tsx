'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ArrowRight, Loader2, Shield, Eye, Trash2, MessageSquare, Timer } from 'lucide-react'
import { IS_TESTNET, NETWORK_NAME } from '@/config/chains'
import { usePrivacyWallet } from '@/providers/privacy-wallet'
import { useDeposit } from '@/hooks/use-deposit'
import { BenchmarkModal } from './benchmark-modal'
import { DepositModal } from './auction/deposit-modal'
import { WithdrawModal } from './auction/withdraw-modal'

export function Header() {
  const { isConnected } = useAccount()
  const {
    isUnlocked,
    isLoading: walletLoading,
    isInitializing,
    isSyncing,
    balance,
    notes,
    unlock,
    sync,
    clearStoredSignature,
    clearAllData,
    formatBalance,
    generateDeposit,
    prepareWithdraw,
    markNoteSpent,
  } = usePrivacyWallet()

  const { tokenBalance, formatTokenAmount, refetchBalance } = useDeposit()
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [showBenchmarkModal, setShowBenchmarkModal] = useState(false)
  const [pendingUnlock, setPendingUnlock] = useState(false)
  const [mockBidType, setMockBidType] = useState<string>('none')

  // Sync mock bid type from localStorage
  useEffect(() => {
    setMockBidType(localStorage.getItem('anon:mockBid') || 'none')
  }, [])

  const isFullyConnected = isConnected && isUnlocked
  const walletBal = tokenBalance ?? 0n
  const poolBal = balance?.available ?? 0n

  // Auto-sync on mount and periodically
  useEffect(() => {
    if (!isUnlocked) return

    sync()
    refetchBalance()

    const interval = setInterval(() => {
      sync()
      refetchBalance()
    }, 30000)

    return () => clearInterval(interval)
  }, [isUnlocked, sync, refetchBalance])

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

  const handleConnectClick = useCallback(
    (openConnectModal: () => void) => {
      clearStoredSignature()

      if (isConnected && !isUnlocked) {
        unlock().then((success) => {
          if (success) {
            sync()
          }
        })
      } else if (!isConnected) {
        setPendingUnlock(true)
        openConnectModal()
      }
    },
    [isConnected, isUnlocked, unlock, sync, clearStoredSignature]
  )

  return (
    <>
      {/* Testnet Banner */}
      {IS_TESTNET && (
        <div className="flex items-center justify-between bg-yellow-500/20 px-4 py-1 text-xs font-medium text-yellow-600">
          <span>{NETWORK_NAME} Testnet</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBenchmarkModal(true)}
              className="flex items-center gap-1 rounded px-2 py-0.5 transition-colors hover:bg-yellow-500/30"
              title="Run withdraw proof benchmark"
            >
              <Timer className="h-3 w-3" />
              <span>Benchmark</span>
            </button>
            <button
              onClick={() => {
                const modes = ['none', 'text', 'image', 'link'] as const
                const currentIndex = modes.indexOf(mockBidType as typeof modes[number])
                const nextIndex = (currentIndex + 1) % modes.length
                const nextMode = modes[nextIndex]
                localStorage.setItem('anon:mockBid', nextMode)
                setMockBidType(nextMode)
                window.dispatchEvent(new Event('mockBidToggle'))
              }}
              className="flex items-center gap-1 rounded px-2 py-0.5 transition-colors hover:bg-yellow-500/30"
              title="Cycle mock bid: none → text → image → link"
            >
              <MessageSquare className="h-3 w-3" />
              <span>Mock: {mockBidType}</span>
            </button>
            <button
              onClick={() => {
                if (confirm('Clear all wallet data from localStorage? You will need to reconnect and any unsynced notes may be lost.')) {
                  clearAllData()
                  window.location.reload()
                }
              }}
              className="flex items-center gap-1 rounded px-2 py-0.5 transition-colors hover:bg-yellow-500/30"
              title="Clear localStorage"
            >
              <Trash2 className="h-3 w-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-lg px-4 pt-4">
        {/* Main Header Card */}
        <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/50 shadow-xl">
          {/* Top Row: Logo + Connect */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Image src="/anon.png" alt="Anon" width={36} height={36} className="rounded-full" />
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-lg font-bold tracking-tight">ANON</span>
                  <div className="flex items-center gap-1.5">
                    <a
                      href="https://x.com/anoncast_"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>
                    <a
                      href="https://warpcast.com/anoncast"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 1000 1000" fill="currentColor">
                        <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
                        <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
                        <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
                      </svg>
                    </a>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Post anonymously</p>
              </div>
            </div>

            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
                const connected = mounted && account && chain && isUnlocked

                if (isInitializing) {
                  return null
                }

                return (
                  <button
                    onClick={() =>
                      connected ? openAccountModal() : handleConnectClick(openConnectModal)
                    }
                    disabled={walletLoading}
                    className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-primary/40 disabled:cursor-wait disabled:opacity-70"
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

          {/* Balance HUD - only show when connected */}
          {isFullyConnected && (
            <div className="border-t border-border/50 bg-black/20 px-3 py-2">
              <div className="flex items-stretch gap-1.5">
                {/* Public Balance - Deposit */}
                <button
                  onClick={() => setShowDepositModal(true)}
                  disabled={walletBal === 0n}
                  className="flex-1 cursor-pointer overflow-hidden rounded-lg bg-white/5 text-left transition-all hover:scale-[1.02] hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                >
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-3 w-3 text-yellow-500" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Public</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-sm font-bold tabular-nums">
                        {formatTokenAmount(walletBal)}
                      </span>
                      {isSyncing && (
                        <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-center gap-1 border-t border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <ArrowRight className="h-3 w-3" />
                    Deposit
                  </div>
                </button>

                {/* Private Balance - Withdraw */}
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={poolBal === 0n}
                  className="flex-1 cursor-pointer overflow-hidden rounded-lg bg-primary/10 text-left ring-1 ring-primary/30 transition-all hover:scale-[1.02] hover:bg-primary/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                >
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3 w-3 text-green-500" />
                      <span className="text-[10px] uppercase tracking-wider text-primary/70">Private</span>
                    </div>
                    <span className="font-mono text-sm font-bold tabular-nums text-primary">
                      {formatBalance(poolBal)}
                    </span>
                  </div>
                  <div className="flex w-full items-center justify-center gap-1 border-t border-primary/20 bg-primary/5 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-primary/70">
                    <ArrowRight className="h-3 w-3 rotate-180" />
                    Withdraw
                  </div>
                </button>
              </div>

              {/* Get tokens hint */}
              {walletBal === 0n && poolBal === 0n && (
                <div className="mt-3 rounded-lg bg-white/5 p-2 text-center text-xs text-muted-foreground">
                  Get ANON on{' '}
                  <a
                    href="https://app.uniswap.org/swap?outputCurrency=0x0Db510e79909666d6dEc7f5e49370838c16D950f&chain=base"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    Uniswap
                  </a>{' '}
                  to get started
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DepositModal
        open={showDepositModal}
        onOpenChange={setShowDepositModal}
        onSuccess={() => setShowDepositModal(false)}
        generateDeposit={generateDeposit}
        sync={sync}
      />

      <WithdrawModal
        open={showWithdrawModal}
        onOpenChange={setShowWithdrawModal}
        onSuccess={() => setShowWithdrawModal(false)}
        privateBalance={poolBal}
        notes={notes}
        prepareWithdraw={prepareWithdraw}
        markNoteSpent={markNoteSpent}
        sync={sync}
        formatBalance={formatBalance}
      />

      <BenchmarkModal
        open={showBenchmarkModal}
        onOpenChange={setShowBenchmarkModal}
        notes={notes}
        prepareWithdraw={prepareWithdraw}
      />
    </>
  )
}
