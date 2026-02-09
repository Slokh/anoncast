import { keccak256, toHex, pad, concat, createPublicClient, http, parseAbiItem, type Chain } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import {
  Note,
  SerializedNote,
  computeCommitment,
  computeNullifierHash,
  hashTwo,
  MERKLE_DEPTH,
  MerkleTree,
} from './transfer'

// Field size for BN254 curve
const FIELD_SIZE = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
)

// ============ Types ============

export type PrivacyWalletState = {
  masterSeed: string
  noteIndex: number
  notes: NoteState[]
  lastScannedBlock: number
}

export type NoteState = {
  index: number
  note: SerializedNote
  status: 'pending' | 'confirmed' | 'spent'
  depositTxHash?: string
  spentTxHash?: string
}

export type WalletBalance = {
  total: bigint
  available: bigint // Unspent notes
  pending: bigint // Pending deposits
  noteCount: number
}

// ============ Deterministic Derivation ============

/**
 * Derive a deterministic value from master seed and path
 */
function derive(masterSeed: bigint, ...path: (string | number)[]): bigint {
  let current = masterSeed
  for (const segment of path) {
    const segmentBytes =
      typeof segment === 'number'
        ? pad(toHex(segment), { size: 32 })
        : toHex(segment, { size: 32 })
    const combined = concat([pad(toHex(current), { size: 32 }), segmentBytes])
    current = BigInt(keccak256(combined)) % FIELD_SIZE
  }
  return current
}

/**
 * Derive a note deterministically from master seed and index
 */
export function deriveNote(
  masterSeed: bigint,
  index: number,
  amount: bigint
): Omit<Note, 'leafIndex' | 'timestamp'> {
  const secret = derive(masterSeed, 'secret', index)
  const nullifier = derive(masterSeed, 'nullifier', index)
  const commitment = computeCommitment(secret, nullifier, amount)

  return {
    secret,
    nullifier,
    commitment,
    amount,
  }
}

/**
 * Derive a claim credential deterministically
 */
export function deriveClaimCredentials(
  masterSeed: bigint,
  slotId: number
): { claimSecret: bigint; claimCommitment: bigint } {
  const claimSecret = derive(masterSeed, 'claim', slotId)
  const claimCommitment = derive(masterSeed, 'claim_commitment', slotId)
  return { claimSecret, claimCommitment }
}

/**
 * Generate master seed from wallet signature
 */
export function generateMasterSeed(signature: string): bigint {
  // Hash the signature to get a deterministic seed
  const hash = keccak256(signature as `0x${string}`)
  return BigInt(hash) % FIELD_SIZE
}

// ============ Privacy Wallet ============

/**
 * Privacy wallet that manages notes deterministically
 */
// Helper to detect chain from RPC URL
function getChainFromRpcUrl(rpcUrl?: string): Chain {
  if (rpcUrl?.includes('sepolia')) {
    return baseSepolia
  }
  return base
}

export class PrivacyWallet {
  private masterSeed: bigint
  private noteIndex: number = 0
  private notes: Map<string, NoteState> = new Map() // commitment -> state
  private client: ReturnType<typeof createPublicClient>
  private contractAddress: `0x${string}`
  private merkleTree: MerkleTree
  private chain: Chain

  constructor(
    masterSeed: bigint,
    contractAddress: `0x${string}`,
    rpcUrl?: string
  ) {
    this.masterSeed = masterSeed
    this.contractAddress = contractAddress
    this.chain = getChainFromRpcUrl(rpcUrl)
    this.client = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl),
    })
    this.merkleTree = new MerkleTree(MERKLE_DEPTH)
  }

  /**
   * Create a privacy wallet from a signature
   */
  static fromSignature(
    signature: string,
    contractAddress: `0x${string}`,
    rpcUrl?: string
  ): PrivacyWallet {
    const masterSeed = generateMasterSeed(signature)
    return new PrivacyWallet(masterSeed, contractAddress, rpcUrl)
  }

  /**
   * Get the message to sign for generating the master seed
   */
  static getSignMessage(): string {
    return `Sign this message to access your AnonPool privacy wallet.

This signature will be used to derive your private keys for anonymous transfers.

WARNING: Never sign this message on a phishing site.`
  }

  /**
   * Generate the next deposit note
   */
  generateDepositNote(amount: bigint): {
    note: Omit<Note, 'leafIndex' | 'timestamp'>
    index: number
  } {
    const index = this.noteIndex
    const note = deriveNote(this.masterSeed, index, amount)
    this.noteIndex++
    return { note, index }
  }

  /**
   * Generate a change note for a transfer
   */
  generateChangeNote(
    inputNoteIndex: number,
    outputAmount: bigint,
    inputAmount: bigint
  ): {
    note: Omit<Note, 'leafIndex' | 'timestamp'>
    index: number
  } {
    const changeAmount = inputAmount - outputAmount
    const index = this.noteIndex
    const note = deriveNote(this.masterSeed, index, changeAmount)
    this.noteIndex++
    return { note, index }
  }

  /**
   * Generate claim credentials for a slot
   */
  getClaimCredentials(slotId: number): {
    claimSecret: bigint
    claimCommitment: bigint
  } {
    return deriveClaimCredentials(this.masterSeed, slotId)
  }

  /**
   * Scan the chain for all notes belonging to this wallet
   */
  async syncFromChain(fromBlock?: bigint): Promise<void> {
    // If no fromBlock specified, get a reasonable starting point
    // For local forks, we only need recent blocks
    if (fromBlock === undefined) {
      const currentBlock = await this.client.getBlockNumber()
      // Go back 10000 blocks max, or to block 0 if chain is shorter
      fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n
    }

    // Scan for Deposit events
    const depositLogs = await this.client.getLogs({
      address: this.contractAddress,
      event: parseAbiItem(
        'event Deposit(bytes32 indexed commitment, uint256 amount, uint32 leafIndex, uint256 timestamp)'
      ),
      fromBlock,
    })

    // Scan for NoteCreated events (change notes)
    const noteCreatedLogs = await this.client.getLogs({
      address: this.contractAddress,
      event: parseAbiItem(
        'event NoteCreated(bytes32 indexed commitment, uint256 amount, uint32 leafIndex)'
      ),
      fromBlock,
    })

    // Build a set of all on-chain commitments
    const onChainCommitments = new Map<
      string,
      { amount: bigint; leafIndex: number; txHash: string }
    >()

    for (const log of depositLogs) {
      onChainCommitments.set(log.args.commitment!, {
        amount: log.args.amount!,
        leafIndex: Number(log.args.leafIndex!),
        txHash: log.transactionHash!,
      })
    }

    for (const log of noteCreatedLogs) {
      onChainCommitments.set(log.args.commitment!, {
        amount: log.args.amount!,
        leafIndex: Number(log.args.leafIndex!),
        txHash: log.transactionHash!,
      })
    }

    // Check which of our derived notes are on-chain
    // We check more indices than we've used locally, in case we're recovering
    const maxIndexToCheck = Math.max(this.noteIndex + 100, 1000)

    for (let i = 0; i < maxIndexToCheck; i++) {
      // We don't know the amount, so we check if the commitment pattern matches
      // by trying common amounts or checking against on-chain data
      for (const [commitmentHex, data] of onChainCommitments) {
        const note = deriveNote(this.masterSeed, i, data.amount)
        const noteCommitmentHex = `0x${note.commitment.toString(16).padStart(64, '0')}`

        if (noteCommitmentHex.toLowerCase() === commitmentHex.toLowerCase()) {
          // Found a match!
          const fullNote: Note = {
            ...note,
            leafIndex: data.leafIndex,
            timestamp: Date.now(), // We'd get this from the block timestamp ideally
          }

          // Check if nullifier is spent
          const nullifierHash = computeNullifierHash(note.nullifier)
          const isSpent = await this.isNullifierSpent(nullifierHash)

          this.notes.set(commitmentHex, {
            index: i,
            note: {
              secret: note.secret.toString(),
              nullifier: note.nullifier.toString(),
              commitment: note.commitment.toString(),
              amount: note.amount.toString(),
              leafIndex: data.leafIndex,
              timestamp: Date.now(),
            },
            status: isSpent ? 'spent' : 'confirmed',
            depositTxHash: data.txHash,
          })

          // Update merkle tree
          this.merkleTree.insert(note.commitment)

          // Update note index if needed
          if (i >= this.noteIndex) {
            this.noteIndex = i + 1
          }

          // Remove from map so we don't check it again
          onChainCommitments.delete(commitmentHex)
          break
        }
      }
    }
  }

  /**
   * Check if a nullifier has been spent on-chain
   */
  async isNullifierSpent(nullifierHash: bigint): Promise<boolean> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: [
        {
          name: 'nullifierSpent',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: '', type: 'bytes32' }],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      functionName: 'nullifierSpent',
      args: [pad(toHex(nullifierHash), { size: 32 })],
    })
    return result as boolean
  }

  /**
   * Get all available (unspent, confirmed) notes
   */
  getAvailableNotes(): Note[] {
    const available: Note[] = []
    for (const state of this.notes.values()) {
      if (state.status === 'confirmed') {
        available.push({
          secret: BigInt(state.note.secret),
          nullifier: BigInt(state.note.nullifier),
          commitment: BigInt(state.note.commitment),
          amount: BigInt(state.note.amount),
          leafIndex: state.note.leafIndex,
          timestamp: state.note.timestamp,
        })
      }
    }
    return available.sort((a, b) => Number(b.amount - a.amount)) // Largest first
  }

  /**
   * Get total wallet balance
   */
  getBalance(): WalletBalance {
    let total = 0n
    let available = 0n
    let pending = 0n
    let noteCount = 0

    for (const state of this.notes.values()) {
      const amount = BigInt(state.note.amount)
      total += amount

      if (state.status === 'confirmed') {
        available += amount
        noteCount++
      } else if (state.status === 'pending') {
        pending += amount
      }
    }

    return { total, available, pending, noteCount }
  }

  /**
   * Find the best note for a transfer amount
   * Returns the smallest note that can cover the transfer
   */
  findNoteForTransfer(outputAmount: bigint): Note | null {
    const available = this.getAvailableNotes()

    // Find smallest note that can cover the transfer
    for (let i = available.length - 1; i >= 0; i--) {
      if (available[i].amount >= outputAmount) {
        return available[i]
      }
    }

    return null
  }

  /**
   * Get merkle proof for a note
   */
  getMerkleProof(leafIndex: number): {
    path: bigint[]
    indices: number[]
    root: bigint
  } {
    const { path, indices } = this.merkleTree.getProof(leafIndex)
    return { path, indices, root: this.merkleTree.getRoot() }
  }

  /**
   * Prepare a transfer with all necessary data
   */
  async prepareTransfer(
    outputAmount: bigint,
    outputCommitment: bigint
  ): Promise<{
    inputNote: Note
    changeNote: Omit<Note, 'leafIndex' | 'timestamp'>
    changeIndex: number
    outputCommitment: bigint
    merkleProof: { path: bigint[]; indices: number[]; root: bigint }
    nullifierHash: bigint
  } | null> {
    // Find a note to spend
    const inputNote = this.findNoteForTransfer(outputAmount)
    if (!inputNote) {
      return null
    }

    // Generate change note
    const { note: changeNote, index: changeIndex } = this.generateChangeNote(
      inputNote.leafIndex,
      outputAmount,
      inputNote.amount
    )

    // Get merkle proof
    const merkleProof = this.getMerkleProof(inputNote.leafIndex)

    // Compute nullifier hash
    const nullifierHash = computeNullifierHash(inputNote.nullifier)

    return {
      inputNote,
      changeNote,
      changeIndex,
      outputCommitment,
      merkleProof,
      nullifierHash,
    }
  }

  /**
   * Prepare consolidation of multiple notes into a single note
   * Uses withdraw proofs with recipient = address(0) to signal consolidation
   */
  async prepareConsolidation(
    notes: Note[]
  ): Promise<{
    noteInputs: Array<{
      note: Note
      merkleProof: { path: bigint[]; indices: number[]; root: bigint }
      nullifierHash: bigint
    }>
    newNote: Omit<Note, 'leafIndex' | 'timestamp'>
    newNoteIndex: number
    totalAmount: bigint
  } | null> {
    if (notes.length === 0) {
      return null
    }

    // Calculate total amount
    const totalAmount = notes.reduce((sum, note) => sum + note.amount, 0n)

    // Prepare data for each note
    const noteInputs: Array<{
      note: Note
      merkleProof: { path: bigint[]; indices: number[]; root: bigint }
      nullifierHash: bigint
    }> = []

    for (const note of notes) {
      const merkleProof = this.getMerkleProof(note.leafIndex)
      const nullifierHash = computeNullifierHash(note.nullifier)

      noteInputs.push({
        note,
        merkleProof,
        nullifierHash,
      })
    }

    // Generate new consolidated note
    const { note: newNote, index: newNoteIndex } = this.generateDepositNote(totalAmount)

    return {
      noteInputs,
      newNote,
      newNoteIndex,
      totalAmount,
    }
  }

  /**
   * Get notes that can be consolidated (more than one available note)
   */
  getConsolidatableNotes(): Note[] {
    return this.getAvailableNotes()
  }

  /**
   * Check if consolidation is possible (has multiple notes)
   */
  canConsolidate(): boolean {
    return this.getAvailableNotes().length > 1
  }

  /**
   * Mark a note as spent locally (before confirmation)
   */
  markNoteSpent(commitment: bigint, txHash: string): void {
    const key = `0x${commitment.toString(16).padStart(64, '0')}`
    const state = this.notes.get(key)
    if (state) {
      state.status = 'spent'
      state.spentTxHash = txHash
    }
  }

  /**
   * Export wallet state for backup (encrypted externally if needed)
   */
  exportState(): PrivacyWalletState {
    return {
      masterSeed: this.masterSeed.toString(),
      noteIndex: this.noteIndex,
      notes: Array.from(this.notes.values()),
      lastScannedBlock: 0, // Would track this in production
    }
  }

  /**
   * Import wallet state from backup
   */
  importState(state: PrivacyWalletState): void {
    this.masterSeed = BigInt(state.masterSeed)
    this.noteIndex = state.noteIndex
    this.notes.clear()
    for (const noteState of state.notes) {
      const key = `0x${BigInt(noteState.note.commitment).toString(16).padStart(64, '0')}`
      this.notes.set(key, noteState)
    }
  }
}

// ============ React Hook Helper ============

const WALLET_STATE_KEY = 'anon_pool_wallet'
const SIGNATURE_KEY = 'anon_pool_signature'

/**
 * Save wallet state to localStorage
 */
export function saveWalletState(state: PrivacyWalletState): void {
  localStorage.setItem(WALLET_STATE_KEY, JSON.stringify(state))
}

/**
 * Load wallet state from localStorage
 */
export function loadWalletState(): PrivacyWalletState | null {
  try {
    const stored = localStorage.getItem(WALLET_STATE_KEY)
    if (!stored) return null
    return JSON.parse(stored)
  } catch {
    return null
  }
}

/**
 * Clear wallet state from localStorage
 */
export function clearWalletState(): void {
  localStorage.removeItem(WALLET_STATE_KEY)
}

/**
 * Clear ALL anon pool related data from localStorage
 * Use this for dev mode reset button
 */
export function clearAllWalletData(): void {
  localStorage.removeItem(WALLET_STATE_KEY)
  localStorage.removeItem(SIGNATURE_KEY)
  // Also clean up any legacy keys with contract addresses
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('anon_pool_')) {
      keysToRemove.push(key)
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key)
  }
}
