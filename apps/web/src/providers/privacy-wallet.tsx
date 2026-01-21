'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { formatUnits, toHex, pad } from 'viem'
import { CONTRACTS, RPC_URL } from '@/config/chains'

// Contract addresses from config
const POOL_CONTRACT = CONTRACTS.POOL

// Proof freshness thresholds
const FRESHNESS_THRESHOLDS = {
  SAFE: 100,      // > 100 deposits until expiry = safe
  WARNING: 50,    // 50-100 = warning
  URGENT: 10,     // 10-50 = urgent
  CRITICAL: 0,    // < 10 = critical
} as const

// ABI for getRootStatus
const GET_ROOT_STATUS_ABI = [
  {
    name: 'getRootStatus',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'root', type: 'bytes32' }],
    outputs: [
      { name: 'exists', type: 'bool' },
      { name: 'depositsAgo', type: 'uint32' },
      { name: 'depositsUntilExpiry', type: 'uint32' },
    ],
  },
] as const

export type RootFreshness = {
  exists: boolean
  depositsAgo: number
  depositsUntilExpiry: number
  status: 'safe' | 'warning' | 'urgent' | 'critical' | 'expired'
  message: string
}

type Note = {
  secret: bigint
  nullifier: bigint
  commitment: bigint
  amount: bigint
  leafIndex: number
  timestamp: number
}

type WalletBalance = {
  total: bigint
  available: bigint
  pending: bigint
  noteCount: number
}

type TransferPreparation = {
  inputNote: Note
  changeNote: { secret: bigint; nullifier: bigint; commitment: bigint; amount: bigint }
  changeIndex: number
  outputCommitment: bigint
  merkleProof: { path: bigint[]; indices: number[]; root: bigint }
  nullifierHash: bigint
}

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
  generateDeposit: (amount: bigint) => { commitment: bigint; note: any } | null
  prepareTransfer: (outputAmount: bigint, outputCommitment: bigint) => Promise<TransferPreparation | null>
  prepareTransferWithFreshnessCheck: (outputAmount: bigint, outputCommitment: bigint) => Promise<{
    preparation: TransferPreparation | null
    freshness: RootFreshness | null
  }>
  findNoteForTransfer: (outputAmount: bigint) => Note | null
  canAffordTransfer: (outputAmount: bigint) => boolean
  getClaimCredentials: (slotId: number) => { claimSecret: bigint; claimCommitment: bigint } | null
  markNoteSpent: (commitment: bigint, txHash: string) => Promise<void>
  formatBalance: (amount: bigint) => string
  checkRootFreshness: (root: bigint) => Promise<RootFreshness | null>

  // Constants
  FRESHNESS_THRESHOLDS: typeof FRESHNESS_THRESHOLDS
}

const PrivacyWalletContext = createContext<PrivacyWalletContextValue | null>(null)

// Lazy load the privacy wallet module
async function loadPrivacyWallet() {
  const module = await import('@anon/pool/privacy-wallet')
  return module
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
  } catch (err) {
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
  const [walletInstance, setWalletInstance] = useState<any>(null)
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
  const restoreFromSignature = useCallback(async (signature: string) => {
    if (!address || !POOL_CONTRACT) return false

    setIsLoading(true)
    setError(null)

    try {
      const { PrivacyWallet, saveWalletState, loadWalletState } = await loadPrivacyWallet()

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
  }, [address])

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
    (amount: bigint): { commitment: bigint; note: any } | null => {
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
  const checkRootFreshness = useCallback(
    async (root: bigint): Promise<RootFreshness | null> => {
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
          abi: GET_ROOT_STATUS_ABI,
          functionName: 'getRootStatus',
          args: [rootBytes],
        })

        const [exists, depositsAgo, depositsUntilExpiry] = result as [boolean, number, number]

        // Determine status and message
        let status: RootFreshness['status']
        let message: string

        if (!exists) {
          status = 'expired'
          message = 'This proof has expired. Please regenerate with the current merkle root.'
        } else if (depositsUntilExpiry > FRESHNESS_THRESHOLDS.SAFE) {
          status = 'safe'
          message = `Proof is fresh (${depositsUntilExpiry} deposits until expiry)`
        } else if (depositsUntilExpiry > FRESHNESS_THRESHOLDS.WARNING) {
          status = 'warning'
          message = `Proof will expire soon (${depositsUntilExpiry} deposits remaining). Consider regenerating.`
        } else if (depositsUntilExpiry > FRESHNESS_THRESHOLDS.CRITICAL) {
          status = 'urgent'
          message = `Proof expiring very soon! Only ${depositsUntilExpiry} deposits until expiry. Regenerate now.`
        } else {
          status = 'critical'
          message = `Proof about to expire! Less than 10 deposits until expiry. Regenerate immediately.`
        }

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
    },
    []
  )

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
    generateDeposit,
    prepareTransfer,
    prepareTransferWithFreshnessCheck,
    findNoteForTransfer,
    canAffordTransfer,
    getClaimCredentials,
    markNoteSpent,
    formatBalance,
    checkRootFreshness,

    // Constants
    FRESHNESS_THRESHOLDS,
  }

  return (
    <PrivacyWalletContext.Provider value={value}>
      {children}
    </PrivacyWalletContext.Provider>
  )
}

export function usePrivacyWallet() {
  const context = useContext(PrivacyWalletContext)
  if (!context) {
    throw new Error('usePrivacyWallet must be used within a PrivacyWalletProvider')
  }
  return context
}
