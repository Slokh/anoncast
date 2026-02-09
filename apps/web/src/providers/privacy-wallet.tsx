'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { formatUnits, toHex, pad } from 'viem'
import { CONTRACTS, RPC_URL } from '@/config/chains'
import {
  FRESHNESS_THRESHOLDS,
  getRootFreshnessStatus,
  PrivacyWallet,
  type RootFreshness,
  type Note,
  type WalletBalance,
  type TransferPreparation,
} from '@anon/sdk/core'
import { ANON_POOL_ABI } from '@anon/sdk/config'
import type { WithdrawPreparation, ConsolidationPreparation } from '@anon/sdk/blockchain'

// Contract addresses from config
const POOL_CONTRACT = CONTRACTS.POOL

// Re-export for backwards compatibility
export type { RootFreshness, Note, WalletBalance, TransferPreparation, WithdrawPreparation, ConsolidationPreparation }

type PrivacyWalletContextValue = {
  // State
  isConnected: boolean
  isUnlocked: boolean
  isLoading: boolean
  isSyncing: boolean
  isInitializing: boolean
  balance: WalletBalance | null
  notes: Note[]
  error: string | null
  hasStoredSignature: boolean

  // Actions
  unlock: () => Promise<boolean>
  lock: () => void
  sync: () => Promise<void>
  clearWallet: () => Promise<void>
  clearStoredSignature: () => void
  clearAllData: () => void
  generateDeposit: (amount: bigint) => {
    commitment: bigint
    note: Omit<Note, 'leafIndex' | 'timestamp'> & { index: number }
  } | null
  prepareTransfer: (
    outputAmount: bigint,
    outputCommitment: bigint
  ) => Promise<TransferPreparation | null>
  prepareTransferWithFreshnessCheck: (
    outputAmount: bigint,
    outputCommitment: bigint
  ) => Promise<{
    preparation: TransferPreparation | null
    freshness: RootFreshness | null
  }>
  prepareWithdraw: (amount: bigint) => Promise<WithdrawPreparation | null>
  prepareConsolidation: (notes: Note[]) => Promise<ConsolidationPreparation | null>
  findNoteForTransfer: (outputAmount: bigint) => Note | null
  findNoteForWithdraw: (amount: bigint) => Note | null
  canAffordTransfer: (outputAmount: bigint) => boolean
  canConsolidate: () => boolean
  getClaimCredentials: (slotId: number) => { claimSecret: bigint; claimCommitment: bigint } | null
  markNoteSpent: (commitment: bigint, txHash: string) => Promise<void>
  markNotesSpent: (commitments: bigint[], txHash: string) => Promise<void>
  formatBalance: (amount: bigint) => string
  checkRootFreshness: (root: bigint) => Promise<RootFreshness | null>

  // Constants
  FRESHNESS_THRESHOLDS: typeof FRESHNESS_THRESHOLDS
}

const PrivacyWalletContext = createContext<PrivacyWalletContextValue | null>(null)

// Lazy load the privacy wallet module
async function loadPrivacyWallet() {
  const walletModule = await import('@anon/sdk/core/privacy-wallet')
  return walletModule
}

// Storage keys
const SIGNATURE_STORAGE_KEY = 'anon_pool_signature'

function saveSignature(address: string, signature: string) {
  try {
    const data = JSON.stringify({ address: address.toLowerCase(), signature })
    localStorage.setItem(SIGNATURE_STORAGE_KEY, data)
  } catch (err) {
    console.error('Failed to save signature:', err)
  }
}

function loadSignature(address: string): string | null {
  try {
    const stored = localStorage.getItem(SIGNATURE_STORAGE_KEY)
    if (!stored) return null
    const data = JSON.parse(stored)
    // Only return signature if it's for the same address
    if (data.address === address.toLowerCase()) {
      return data.signature
    }
    return null
  } catch {
    return null
  }
}

function clearSignature() {
  try {
    localStorage.removeItem(SIGNATURE_STORAGE_KEY)
  } catch (err) {
    console.error('Failed to clear signature:', err)
  }
}

export function PrivacyWalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected, status: accountStatus } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [error, setError] = useState<string | null>(null)

  // Store wallet instance in ref-like state
  const [walletInstance, setWalletInstance] = useState<PrivacyWallet | null>(null)
  const [hasStoredSignature, setHasStoredSignature] = useState(false)

  // Check for existing signature on mount and auto-restore if available
  useEffect(() => {
    // Wait for wagmi to finish reconnecting
    if (accountStatus === 'reconnecting' || accountStatus === 'connecting') {
      return
    }

    if (!address || !POOL_CONTRACT) {
      setHasStoredSignature(false)
      setIsInitializing(false)
      return
    }

    const signature = loadSignature(address)
    setHasStoredSignature(!!signature)

    // Auto-restore ONLY if we have a stored signature (page refresh scenario)
    if (signature && !walletInstance && !isLoading) {
      restoreFromSignature(signature).finally(() => {
        setIsInitializing(false)
      })
    } else {
      setIsInitializing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, accountStatus])

  // Clear state when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setWalletInstance(null)
      setIsUnlocked(false)
      setIsLoading(false)
      setIsSyncing(false)
      setBalance(null)
      setNotes([])
      setError(null)
    }
  }, [isConnected])

  /**
   * Restore wallet from a saved signature (no user interaction needed)
   */
  const restoreFromSignature = useCallback(
    async (signature: string) => {
      if (!address || !POOL_CONTRACT) return false

      setIsLoading(true)
      setError(null)

      try {
        const { PrivacyWallet, loadWalletState } = await loadPrivacyWallet()

        // Create wallet from signature
        const wallet = PrivacyWallet.fromSignature(signature, POOL_CONTRACT, RPC_URL)

        // Try to load existing state
        const savedState = loadWalletState()
        if (savedState) {
          wallet.importState(savedState)
        }

        setWalletInstance(wallet)

        // Get initial balance
        const walletBalance = wallet.getBalance()
        const walletNotes = wallet.getAvailableNotes()

        setIsUnlocked(true)
        setIsLoading(false)
        setBalance(walletBalance)
        setNotes(walletNotes)

        return true
      } catch (err) {
        console.error('Failed to restore wallet:', err)
        // Clear invalid signature
        clearSignature()
        setHasStoredSignature(false)
        setIsLoading(false)
        setError('Failed to restore wallet session')
        return false
      }
    },
    [address]
  )

  /**
   * Unlock the privacy wallet by signing a message
   * Always requests a fresh signature (for manual connect flow)
   */
  const unlock = useCallback(async () => {
    if (!address || !POOL_CONTRACT) {
      setError('Wallet not connected or contract not configured')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      const { PrivacyWallet, saveWalletState, loadWalletState } = await loadPrivacyWallet()

      // Get the sign message
      const message = PrivacyWallet.getSignMessage()

      // Request signature (always fresh on manual connect)
      const signature = await signMessageAsync({ message })

      // Save signature for auto-restore on next visit
      saveSignature(address, signature)
      setHasStoredSignature(true)

      // Create wallet from signature
      const wallet = PrivacyWallet.fromSignature(signature, POOL_CONTRACT, RPC_URL)

      // Try to load existing state
      const savedState = loadWalletState()
      if (savedState) {
        wallet.importState(savedState)
      }

      setWalletInstance(wallet)

      // Get initial balance
      const walletBalance = wallet.getBalance()
      const walletNotes = wallet.getAvailableNotes()

      setIsUnlocked(true)
      setIsLoading(false)
      setBalance(walletBalance)
      setNotes(walletNotes)

      // Save state
      saveWalletState(wallet.exportState())

      return true
    } catch (err) {
      setIsLoading(false)
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet')
      return false
    }
  }, [address, signMessageAsync])

  /**
   * Sync wallet state from chain
   */
  const sync = useCallback(async () => {
    if (!walletInstance) return

    setIsSyncing(true)

    try {
      await walletInstance.syncFromChain()

      const { saveWalletState } = await loadPrivacyWallet()
      const walletBalance = walletInstance.getBalance()
      const walletNotes = walletInstance.getAvailableNotes()

      setBalance(walletBalance)
      setNotes(walletNotes)

      // Save updated state
      saveWalletState(walletInstance.exportState())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync')
    } finally {
      setIsSyncing(false)
    }
  }, [walletInstance])

  /**
   * Generate a deposit note
   */
  const generateDeposit = useCallback(
    (
      amount: bigint
    ): {
      commitment: bigint
      note: Omit<Note, 'leafIndex' | 'timestamp'> & { index: number }
    } | null => {
      if (!walletInstance) return null

      const { note, index } = walletInstance.generateDepositNote(amount)
      return { commitment: note.commitment, note: { ...note, index } }
    },
    [walletInstance]
  )

  /**
   * Prepare a transfer
   */
  const prepareTransfer = useCallback(
    async (outputAmount: bigint, outputCommitment: bigint): Promise<TransferPreparation | null> => {
      if (!walletInstance) return null

      const result = await walletInstance.prepareTransfer(outputAmount, outputCommitment)
      return result
    },
    [walletInstance]
  )

  /**
   * Find the best note for a given transfer amount
   */
  const findNoteForTransfer = useCallback(
    (outputAmount: bigint): Note | null => {
      if (!walletInstance) return null
      return walletInstance.findNoteForTransfer(outputAmount)
    },
    [walletInstance]
  )

  /**
   * Find a note that exactly matches the withdrawal amount
   */
  const findNoteForWithdraw = useCallback(
    (amount: bigint): Note | null => {
      if (!walletInstance) return null
      const available = walletInstance.getAvailableNotes()
      // For withdrawals, we need an exact match or a larger note
      return available.find((note: Note) => note.amount >= amount) || null
    },
    [walletInstance]
  )

  /**
   * Prepare a withdrawal (full note withdrawal, no change)
   */
  const prepareWithdraw = useCallback(
    async (amount: bigint): Promise<WithdrawPreparation | null> => {
      if (!walletInstance) return null

      // Find a note to spend - for withdrawals we need an exact amount match
      // or we withdraw the full note amount
      const inputNote = walletInstance.findNoteForTransfer(amount)
      if (!inputNote) {
        return null
      }

      // Get merkle proof
      const merkleProof = walletInstance.getMerkleProof(inputNote.leafIndex)

      // Compute nullifier hash
      const { computeNullifierHash } = await import('@anon/sdk/core/transfer')
      const nullifierHash = computeNullifierHash(inputNote.nullifier)

      return {
        inputNote,
        merkleProof,
        nullifierHash,
      }
    },
    [walletInstance]
  )

  /**
   * Check if we can afford a transfer
   */
  const canAffordTransfer = useCallback(
    (outputAmount: bigint): boolean => {
      if (!balance) return false
      return balance.available >= outputAmount
    },
    [balance]
  )

  /**
   * Get claim credentials for a slot (for auction use case)
   */
  const getClaimCredentials = useCallback(
    (slotId: number): { claimSecret: bigint; claimCommitment: bigint } | null => {
      if (!walletInstance) return null
      return walletInstance.getClaimCredentials(slotId)
    },
    [walletInstance]
  )

  /**
   * Mark a note as spent
   */
  const markNoteSpent = useCallback(
    async (commitment: bigint, txHash: string) => {
      if (!walletInstance) return

      walletInstance.markNoteSpent(commitment, txHash)

      const { saveWalletState } = await loadPrivacyWallet()
      const walletBalance = walletInstance.getBalance()
      const walletNotes = walletInstance.getAvailableNotes()

      setBalance(walletBalance)
      setNotes(walletNotes)
      saveWalletState(walletInstance.exportState())
    },
    [walletInstance]
  )

  /**
   * Mark multiple notes as spent (for consolidation)
   */
  const markNotesSpent = useCallback(
    async (commitments: bigint[], txHash: string) => {
      if (!walletInstance) return

      for (const commitment of commitments) {
        walletInstance.markNoteSpent(commitment, txHash)
      }

      const { saveWalletState } = await loadPrivacyWallet()
      const walletBalance = walletInstance.getBalance()
      const walletNotes = walletInstance.getAvailableNotes()

      setBalance(walletBalance)
      setNotes(walletNotes)
      saveWalletState(walletInstance.exportState())
    },
    [walletInstance]
  )

  /**
   * Prepare consolidation of multiple notes
   */
  const prepareConsolidation = useCallback(
    async (notesToConsolidate: Note[]): Promise<ConsolidationPreparation | null> => {
      if (!walletInstance) return null
      return walletInstance.prepareConsolidation(notesToConsolidate)
    },
    [walletInstance]
  )

  /**
   * Check if consolidation is possible
   */
  const canConsolidate = useCallback((): boolean => {
    if (!walletInstance) return false
    return walletInstance.canConsolidate()
  }, [walletInstance])

  /**
   * Lock the wallet (clear from memory, keep in storage)
   */
  const lock = useCallback(() => {
    setWalletInstance(null)
    setIsUnlocked(false)
    setIsLoading(false)
    setIsSyncing(false)
    setBalance(null)
    setNotes([])
    setError(null)
  }, [])

  /**
   * Clear all wallet data including signature
   */
  const clearWallet = useCallback(async () => {
    const { clearWalletState } = await loadPrivacyWallet()
    clearWalletState()
    clearSignature()
    setHasStoredSignature(false)
    lock()
  }, [lock])

  /**
   * Clear ALL anon pool data from localStorage (dev mode reset)
   */
  const clearAllData = useCallback(async () => {
    const { clearAllWalletData } = await loadPrivacyWallet()
    clearAllWalletData()
    setHasStoredSignature(false)
    lock()
  }, [lock])

  /**
   * Clear only the stored signature (used before manual connect to force new signature)
   */
  const clearStoredSignatureAction = useCallback(() => {
    clearSignature()
    setHasStoredSignature(false)
  }, [])

  /**
   * Format balance for display
   */
  const formatBalance = useCallback((amount: bigint): string => {
    return formatUnits(amount, 18)
  }, [])

  /**
   * Check the freshness of a merkle root for proof validity
   */
  const checkRootFreshness = useCallback(async (root: bigint): Promise<RootFreshness | null> => {
    if (!POOL_CONTRACT) return null

    try {
      // Convert bigint to bytes32
      const rootBytes = pad(toHex(root), { size: 32 }) as `0x${string}`

      const { createPublicClient, http } = await import('viem')
      const { base, baseSepolia } = await import('viem/chains')

      const chain = RPC_URL?.includes('sepolia') ? baseSepolia : base
      const client = createPublicClient({
        chain,
        transport: http(RPC_URL),
      })

      const result = await client.readContract({
        address: POOL_CONTRACT as `0x${string}`,
        abi: ANON_POOL_ABI,
        functionName: 'getRootStatus',
        args: [rootBytes],
      })

      const [exists, depositsAgo, depositsUntilExpiry] = result as [boolean, number, number]

      // Get status and message from SDK helper
      const { status, message } = getRootFreshnessStatus(exists, depositsUntilExpiry)

      return {
        exists,
        depositsAgo,
        depositsUntilExpiry,
        status,
        message,
      }
    } catch (err) {
      console.error('Failed to check root freshness:', err)
      return null
    }
  }, [])

  /**
   * Prepare a transfer with freshness check
   */
  const prepareTransferWithFreshnessCheck = useCallback(
    async (
      outputAmount: bigint,
      outputCommitment: bigint
    ): Promise<{
      preparation: TransferPreparation | null
      freshness: RootFreshness | null
    }> => {
      const preparation = await prepareTransfer(outputAmount, outputCommitment)

      if (!preparation) {
        return { preparation: null, freshness: null }
      }

      const freshness = await checkRootFreshness(preparation.merkleProof.root)

      return { preparation, freshness }
    },
    [prepareTransfer, checkRootFreshness]
  )

  const value: PrivacyWalletContextValue = {
    // State
    isConnected,
    isUnlocked,
    isLoading,
    isSyncing,
    isInitializing,
    balance,
    notes,
    error,
    hasStoredSignature,

    // Actions
    unlock,
    lock,
    sync,
    clearWallet,
    clearStoredSignature: clearStoredSignatureAction,
    clearAllData,
    generateDeposit,
    prepareTransfer,
    prepareTransferWithFreshnessCheck,
    prepareWithdraw,
    prepareConsolidation,
    findNoteForTransfer,
    findNoteForWithdraw,
    canAffordTransfer,
    canConsolidate,
    getClaimCredentials,
    markNoteSpent,
    markNotesSpent,
    formatBalance,
    checkRootFreshness,

    // Constants
    FRESHNESS_THRESHOLDS,
  }

  return <PrivacyWalletContext.Provider value={value}>{children}</PrivacyWalletContext.Provider>
}

export function usePrivacyWallet() {
  const context = useContext(PrivacyWalletContext)
  if (!context) {
    throw new Error('usePrivacyWallet must be used within a PrivacyWalletProvider')
  }
  return context
}
