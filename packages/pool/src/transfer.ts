import { keccak256, toHex, pad, concat } from 'viem'
import { Circuit } from './utils/circuit'

// Will be generated after compiling the circuit
// import circuit from './transfer-circuit/target/anon_transfer.json'
// import vkey from './transfer-circuit/target/vkey.json'

export const MERKLE_DEPTH = 20

// Field size for BN254 curve
const FIELD_SIZE = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
)

// ============ Types ============

export type TransferProofData = {
  proof: number[]
  publicInputs: string[]
}

export type Note = {
  secret: bigint
  nullifier: bigint
  commitment: bigint
  amount: bigint
  leafIndex: number
  timestamp: number
}

export type SerializedNote = {
  secret: string
  nullifier: string
  commitment: string
  amount: string
  leafIndex: number
  timestamp: number
}

export type TransferInput = {
  // Input note being spent
  note: Note
  merklePath: bigint[]
  merkleIndices: number[]
  merkleRoot: bigint

  // Transfer details
  outputAmount: bigint

  // Change note (remainder after transfer)
  changeNote: Note

  // Output commitment for recipient
  outputCommitment: bigint
}

export type ParsedTransferData = {
  nullifierHash: string
  merkleRoot: string
  outputAmount: string
  changeCommitment: string
  changeAmount: string
  outputCommitment: string
}

// ============ Hash Functions ============

/**
 * Hash two values together using keccak256, reduced to field size
 */
export function hashTwo(left: bigint, right: bigint): bigint {
  const leftBytes = pad(toHex(left), { size: 32 })
  const rightBytes = pad(toHex(right), { size: 32 })
  const hash = keccak256(concat([leftBytes, rightBytes]))
  return BigInt(hash) % FIELD_SIZE
}

/**
 * Hash a single value using keccak256, reduced to field size
 */
export function hashOne(value: bigint): bigint {
  const bytes = pad(toHex(value), { size: 32 })
  const hash = keccak256(bytes)
  return BigInt(hash) % FIELD_SIZE
}

/**
 * Compute commitment from secret, nullifier, and amount.
 * The amount MUST be included to bind the note's value cryptographically.
 * commitment = hash(hash(secret, nullifier), amount)
 */
export function computeCommitment(secret: bigint, nullifier: bigint, amount: bigint): bigint {
  const inner = hashTwo(secret, nullifier)
  return hashTwo(inner, amount)
}

/**
 * Compute nullifier hash (used on-chain to prevent double-spend)
 */
export function computeNullifierHash(nullifier: bigint): bigint {
  return hashOne(nullifier)
}

// ============ Note Generation ============

/**
 * Generate random bytes (works in browser and Node)
 */
function randomBytes(length: number): Uint8Array {
  if (typeof window !== 'undefined' && window.crypto) {
    const bytes = new Uint8Array(length)
    window.crypto.getRandomValues(bytes)
    return bytes
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto')
    return new Uint8Array(crypto.randomBytes(length))
  }
}

/**
 * Convert bytes to bigint
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = BigInt(0)
  for (const byte of bytes) {
    result = result * BigInt(256) + BigInt(byte)
  }
  return result
}

/**
 * Generate a new note with random secret and nullifier
 */
export function generateNote(amount: bigint): Omit<Note, 'leafIndex' | 'timestamp'> {
  // Use 31 bytes to stay under field size
  const secret = bytesToBigInt(randomBytes(31))
  const nullifier = bytesToBigInt(randomBytes(31))
  const commitment = computeCommitment(secret, nullifier, amount)

  return {
    secret,
    nullifier,
    commitment,
    amount,
  }
}

/**
 * Generate a change note for a transfer
 */
export function generateChangeNote(
  inputAmount: bigint,
  outputAmount: bigint
): Omit<Note, 'leafIndex' | 'timestamp'> {
  const changeAmount = inputAmount - outputAmount
  if (changeAmount < 0n) {
    throw new Error('Output amount exceeds input amount')
  }
  return generateNote(changeAmount)
}

/**
 * Generate an output note for the recipient.
 * The recipient must know (secret, nullifier, amount) to later spend the note.
 * Returns a partial note (without leafIndex/timestamp which are determined on-chain).
 */
export function generateOutputNote(amount: bigint): {
  outputNote: Omit<Note, 'leafIndex' | 'timestamp'>
} {
  const secret = bytesToBigInt(randomBytes(31))
  const nullifier = bytesToBigInt(randomBytes(31))
  const commitment = computeCommitment(secret, nullifier, amount)
  return {
    outputNote: {
      secret,
      nullifier,
      commitment,
      amount,
    },
  }
}

/**
 * @deprecated Use generateOutputNote instead for proper commitment binding with amount.
 * This function is kept for backwards compatibility but should not be used in new code.
 */
export function generateOutputCommitment(): {
  outputSecret: bigint
  outputCommitment: bigint
} {
  console.warn('generateOutputCommitment is deprecated. Use generateOutputNote instead.')
  const outputSecret = bytesToBigInt(randomBytes(31))
  const outputCommitment = hashOne(outputSecret)
  return { outputSecret, outputCommitment }
}

// ============ Note Serialization ============

/**
 * Serialize a note to a JSON-safe format
 */
export function serializeNote(note: Note): SerializedNote {
  return {
    secret: note.secret.toString(),
    nullifier: note.nullifier.toString(),
    commitment: note.commitment.toString(),
    amount: note.amount.toString(),
    leafIndex: note.leafIndex,
    timestamp: note.timestamp,
  }
}

/**
 * Deserialize a note from JSON
 */
export function deserializeNote(serialized: SerializedNote): Note {
  return {
    secret: BigInt(serialized.secret),
    nullifier: BigInt(serialized.nullifier),
    commitment: BigInt(serialized.commitment),
    amount: BigInt(serialized.amount),
    leafIndex: serialized.leafIndex,
    timestamp: serialized.timestamp,
  }
}

/**
 * Encode a note to a base64 string (for backup/storage)
 */
export function encodeNote(note: Note): string {
  return Buffer.from(JSON.stringify(serializeNote(note))).toString('base64')
}

/**
 * Decode a note from a base64 string
 */
export function decodeNote(encoded: string): Note {
  return deserializeNote(JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8')))
}

// ============ Merkle Tree ============

/**
 * Compute zero value for the tree (matches contract)
 */
function getZeroValue(): bigint {
  const hash = keccak256(toHex('anon_pool'))
  return BigInt(hash) % FIELD_SIZE
}

/**
 * Merkle tree for tracking deposits and change notes
 */
export class MerkleTree {
  private levels: bigint[][]
  private depth: number
  private zeroValues: bigint[]

  constructor(depth: number = MERKLE_DEPTH) {
    this.depth = depth
    this.zeroValues = this.computeZeroValues()
    this.levels = Array.from({ length: depth + 1 }, () => [])
  }

  private computeZeroValues(): bigint[] {
    const zeros: bigint[] = []
    let current = getZeroValue()
    zeros.push(current)

    for (let i = 0; i < this.depth; i++) {
      current = hashTwo(current, current)
      zeros.push(current)
    }
    return zeros
  }

  /**
   * Insert a commitment into the tree
   */
  insert(commitment: bigint): number {
    const leafIndex = this.levels[0].length
    this.levels[0].push(commitment)

    // Update path to root
    let index = leafIndex
    for (let level = 0; level < this.depth; level++) {
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1
      const sibling =
        siblingIndex < this.levels[level].length
          ? this.levels[level][siblingIndex]
          : this.zeroValues[level]

      const parentIndex = Math.floor(index / 2)
      const left = index % 2 === 0 ? this.levels[level][index] : sibling
      const right = index % 2 === 0 ? sibling : this.levels[level][index]

      if (!this.levels[level + 1]) {
        this.levels[level + 1] = []
      }
      this.levels[level + 1][parentIndex] = hashTwo(left, right)

      index = parentIndex
    }

    return leafIndex
  }

  /**
   * Get the current root
   */
  getRoot(): bigint {
    if (this.levels[this.depth].length === 0) {
      return this.zeroValues[this.depth]
    }
    return this.levels[this.depth][0]
  }

  /**
   * Get merkle proof for a leaf
   */
  getProof(leafIndex: number): {
    path: bigint[]
    indices: number[]
  } {
    const path: bigint[] = []
    const indices: number[] = []

    let index = leafIndex
    for (let level = 0; level < this.depth; level++) {
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1
      const sibling =
        siblingIndex < this.levels[level].length
          ? this.levels[level][siblingIndex]
          : this.zeroValues[level]

      path.push(sibling)
      indices.push(index % 2) // 0 if current is left, 1 if right

      index = Math.floor(index / 2)
    }

    return { path, indices }
  }

  /**
   * Verify a merkle proof
   */
  verifyProof(
    leaf: bigint,
    path: bigint[],
    indices: number[],
    root: bigint
  ): boolean {
    let current = leaf
    for (let i = 0; i < path.length; i++) {
      const sibling = path[i]
      if (indices[i] === 0) {
        current = hashTwo(current, sibling)
      } else {
        current = hashTwo(sibling, current)
      }
    }
    return current === root
  }
}

// ============ Circuit Verifier ============

/**
 * Transfer verifier class for generating and verifying ZK proofs
 */
export class TransferVerifier extends Circuit {
  constructor(circuit: unknown, vkey: unknown) {
    super(circuit, vkey)
  }

  /**
   * Generate a proof for a transfer with change
   */
  async generateTransferProof(input: TransferInput): Promise<TransferProofData> {
    const nullifierHash = computeNullifierHash(input.note.nullifier)

    const circuitInput = {
      // Input note
      secret: `0x${input.note.secret.toString(16)}`,
      nullifier: `0x${input.note.nullifier.toString(16)}`,
      input_amount: `0x${input.note.amount.toString(16)}`,

      // Merkle proof
      merkle_path: input.merklePath.map((p) => `0x${p.toString(16)}`),
      merkle_indices: input.merkleIndices,

      // Change note
      change_secret: `0x${input.changeNote.secret.toString(16)}`,
      change_nullifier: `0x${input.changeNote.nullifier.toString(16)}`,

      // Public inputs
      nullifier_hash: `0x${nullifierHash.toString(16)}`,
      merkle_root: `0x${input.merkleRoot.toString(16)}`,
      output_amount: `0x${input.outputAmount.toString(16)}`,
      change_commitment: `0x${input.changeNote.commitment.toString(16)}`,
      change_amount: `0x${input.changeNote.amount.toString(16)}`,
      output_commitment: `0x${input.outputCommitment.toString(16)}`,
    }

    const proof = await super.generate(circuitInput)

    return {
      proof: Array.from(proof.proof),
      publicInputs: proof.publicInputs,
    }
  }

  /**
   * Verify a transfer proof
   */
  async verifyTransferProof(proof: TransferProofData): Promise<boolean> {
    return super.verify({
      proof: new Uint8Array(proof.proof),
      publicInputs: proof.publicInputs,
    })
  }

  /**
   * Parse public inputs from a transfer proof
   */
  parseData(publicInputs: string[]): ParsedTransferData {
    return {
      nullifierHash: publicInputs[0],
      merkleRoot: publicInputs[1],
      outputAmount: publicInputs[2],
      changeCommitment: publicInputs[3],
      changeAmount: publicInputs[4],
      outputCommitment: publicInputs[5],
    }
  }
}

// ============ Transfer Preparation ============

/**
 * Prepare a transfer with automatic change note generation
 */
export function prepareTransfer(
  note: Note,
  merkleTree: MerkleTree,
  outputAmount: bigint,
  outputCommitment: bigint
): {
  changeNote: Omit<Note, 'leafIndex' | 'timestamp'>
  merklePath: bigint[]
  merkleIndices: number[]
  merkleRoot: bigint
} {
  if (outputAmount > note.amount) {
    throw new Error(
      `Output amount (${outputAmount}) exceeds note amount (${note.amount})`
    )
  }

  if (outputAmount <= 0n) {
    throw new Error('Output amount must be positive')
  }

  // Generate change note
  const changeAmount = note.amount - outputAmount
  const changeNote = generateNote(changeAmount)

  // Get merkle proof
  const { path: merklePath, indices: merkleIndices } = merkleTree.getProof(
    note.leafIndex
  )
  const merkleRoot = merkleTree.getRoot()

  return {
    changeNote,
    merklePath,
    merkleIndices,
    merkleRoot,
  }
}
