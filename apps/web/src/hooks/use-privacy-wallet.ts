'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useSignMessage, useReadContract } from 'wagmi'
import { formatUnits, toHex, pad } from 'viem'
import { CONTRACTS, RPC_URL } from '@/config/chains'

// Contract address from config
const AUCTION_CONTRACT = CONTRACTS.AUCTION
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

type PrivacyWalletState = {
  isUnlocked: boolean
  isLoading: boolean
  isSyncing: boolean
  balance: WalletBalance | null
  notes: Note[]
  error: string | null
}

type TransferPreparation = {
  inputNote: Note
  changeNote: { secret: bigint; nullifier: bigint; commitment: bigint; amount: bigint }
  changeIndex: number
  outputCommitment: bigint
  merkleProof: { path: bigint[]; indices: number[]; root: bigint }
  nullifierHash: bigint
}

// Lazy load the privacy wallet module
async function loadPrivacyWallet() {
  const module = await import('@anon/pool/privacy-wallet')
  return module
}

export function usePrivacyWallet() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [state, setState] = useState<PrivacyWalletState>({
    isUnlocked: false,
    isLoading: false,
    isSyncing: false,
    balance: null,
    notes: [],
    error: null,
  })

  // Store wallet instance in ref-like state
  const [walletInstance, setWalletInstance] = useState<any>(null)

  // Check for existing wallet state on mount
  useEffect(() => {
    if (!address || !AUCTION_CONTRACT) return

    async function checkExistingState() {
      try {
        const { loadWalletState, PrivacyWallet } = await loadPrivacyWallet()
        const savedState = loadWalletState()

        if (savedState) {
          // Recreate wallet from saved state
          // Note: We need the signature to recreate, so we just mark as needing unlock
          setState((prev) => ({
            ...prev,
            isUnlocked: false,
            error: null,
          }))
        }
      } catch (err) {
        console.error('Failed to check wallet state:', err)
      }
    }

    checkExistingState()
  }, [address])

  /**
   * Unlock the privacy wallet by signing a message
   */
  const unlock = useCallback(async () => {
    if (!address || !AUCTION_CONTRACT) {
      setState((prev) => ({ ...prev, error: 'Wallet not connected or contract not configured' }))
      return false
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      const { PrivacyWallet, saveWalletState } = await loadPrivacyWallet()

      // Get the sign message
      const message = PrivacyWallet.getSignMessage()

      // Request signature
      const signature = await signMessageAsync({ message })

      // Create wallet from signature
      const wallet = PrivacyWallet.fromSignature(signature, AUCTION_CONTRACT, RPC_URL)

      // Try to load existing state
      const { loadWalletState } = await loadPrivacyWallet()
      const savedState = loadWalletState()
      if (savedState) {
        wallet.importState(savedState)
      }

      setWalletInstance(wallet)

      // Get initial balance
      const balance = wallet.getBalance()
      const notes = wallet.getAvailableNotes()

      setState({
        isUnlocked: true,
        isLoading: false,
        isSyncing: false,
        balance,
        notes,
        error: null,
      })

      // Save state
      saveWalletState(wallet.exportState())

      return true
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to unlock wallet',
      }))
      return false
    }
  }, [address, signMessageAsync])

  /**
   * Sync wallet state from chain
   */
  const sync = useCallback(async () => {
    if (!walletInstance) return

    setState((prev) => ({ ...prev, isSyncing: true }))

    try {
      await walletInstance.syncFromChain()

      const { saveWalletState } = await loadPrivacyWallet()
      const balance = walletInstance.getBalance()
      const notes = walletInstance.getAvailableNotes()

      setState((prev) => ({
        ...prev,
        isSyncing: false,
        balance,
        notes,
      }))

      // Save updated state
      saveWalletState(walletInstance.exportState())
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        error: err instanceof Error ? err.message : 'Failed to sync',
      }))
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
      if (!state.balance) return false
      return state.balance.available >= outputAmount
    },
    [state.balance]
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
      const balance = walletInstance.getBalance()
      const notes = walletInstance.getAvailableNotes()

      setState((prev) => ({ ...prev, balance, notes }))
      saveWalletState(walletInstance.exportState())
    },
    [walletInstance]
  )

  /**
   * Add a pending deposit
   */
  const addPendingDeposit = useCallback(
    async (note: any, index: number, txHash: string) => {
      if (!walletInstance) return

      walletInstance.addPendingDeposit(note, index, txHash)

      const { saveWalletState } = await loadPrivacyWallet()
      const balance = walletInstance.getBalance()

      setState((prev) => ({ ...prev, balance }))
      saveWalletState(walletInstance.exportState())
    },
    [walletInstance]
  )

  /**
   * Lock the wallet (clear from memory, keep in storage)
   */
  const lock = useCallback(() => {
    setWalletInstance(null)
    setState({
      isUnlocked: false,
      isLoading: false,
      isSyncing: false,
      balance: null,
      notes: [],
      error: null,
    })
  }, [])

  /**
   * Clear all wallet data
   */
  const clearWallet = useCallback(async () => {
    const { clearWalletState } = await loadPrivacyWallet()
    clearWalletState()
    lock()
  }, [lock])

  /**
   * Format balance for display
   */
  const formatBalance = useCallback((amount: bigint): string => {
    return formatUnits(amount, 18)
  }, [])

  /**
   * Check the freshness of a merkle root for proof validity
   * @param root The merkle root to check (as bigint)
   * @returns Freshness status with warnings
   */
  const checkRootFreshness = useCallback(
    async (root: bigint): Promise<RootFreshness | null> => {
      if (!POOL_CONTRACT) return null

      try {
        // Convert bigint to bytes32
        const rootBytes = pad(toHex(root), { size: 32 }) as `0x${string}`

        // This would typically use useReadContract, but for flexibility we use a direct call
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
   * Returns the preparation data along with freshness status
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

  return {
    // State
    isConnected,
    isUnlocked: state.isUnlocked,
    isLoading: state.isLoading,
    isSyncing: state.isSyncing,
    balance: state.balance,
    notes: state.notes,
    error: state.error,

    // Actions
    unlock,
    lock,
    sync,
    clearWallet,
    generateDeposit,
    prepareTransfer,
    prepareTransferWithFreshnessCheck,
    findNoteForTransfer,
    canAffordTransfer,
    getClaimCredentials,
    markNoteSpent,
    addPendingDeposit,
    formatBalance,
    checkRootFreshness,

    // Constants
    FRESHNESS_THRESHOLDS,
  }
}
