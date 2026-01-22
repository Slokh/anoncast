import { Circuit } from './circuit'
import { computeNullifierHash, Note, MERKLE_DEPTH } from './transfer'

// ============ Types ============

export type WithdrawProofData = {
  proof: number[]
  publicInputs: string[]
}

export type WithdrawInput = {
  // Input note being spent
  note: Note
  merklePath: bigint[]
  merkleIndices: number[]
  merkleRoot: bigint

  // Recipient address (as bigint, converted from address)
  recipient: bigint
}

export type ParsedWithdrawData = {
  nullifierHash: string
  merkleRoot: string
  withdrawAmount: string
  recipient: string
}

// ============ Circuit Verifier ============

/**
 * Withdraw verifier class for generating and verifying ZK proofs
 */
export class WithdrawVerifier extends Circuit {
  constructor(circuit: unknown, vkey: unknown) {
    super(circuit, vkey)
  }

  /**
   * Build the circuit input from a withdraw input
   */
  private buildCircuitInput(input: WithdrawInput) {
    const nullifierHash = computeNullifierHash(input.note.nullifier)

    // Pad merkle path and indices to MERKLE_DEPTH if needed
    const merklePath = [...input.merklePath]
    const merkleIndices = [...input.merkleIndices]
    while (merklePath.length < MERKLE_DEPTH) {
      merklePath.push(0n)
      merkleIndices.push(0)
    }

    return {
      // Private inputs
      secret: `0x${input.note.secret.toString(16)}`,
      nullifier: `0x${input.note.nullifier.toString(16)}`,
      amount: `0x${input.note.amount.toString(16)}`,

      // Merkle proof
      merkle_path: merklePath.map((p) => `0x${p.toString(16)}`),
      merkle_indices: merkleIndices,

      // Public inputs
      nullifier_hash: `0x${nullifierHash.toString(16)}`,
      merkle_root: `0x${input.merkleRoot.toString(16)}`,
      withdraw_amount: `0x${input.note.amount.toString(16)}`,
      recipient: `0x${input.recipient.toString(16)}`,
    }
  }

  /**
   * Generate a proof for a withdrawal (using bb.js - for local verification only)
   */
  async generateWithdrawProof(input: WithdrawInput): Promise<WithdrawProofData> {
    const circuitInput = this.buildCircuitInput(input)
    const proof = await super.generate(circuitInput)

    return {
      proof: Array.from(proof.proof),
      publicInputs: proof.publicInputs,
    }
  }

  /**
   * Generate a Solidity-compatible proof for on-chain verification
   * Uses bb.js 0.82.2 with keccak option for EVM compatibility
   */
  async generateSolidityWithdrawProof(input: WithdrawInput): Promise<WithdrawProofData> {
    const circuitInput = this.buildCircuitInput(input)
    const proof = await super.generate(circuitInput, { keccak: true })

    return {
      proof: Array.from(proof.proof),
      publicInputs: proof.publicInputs,
    }
  }

  /**
   * Verify a withdraw proof
   */
  async verifyWithdrawProof(proof: WithdrawProofData): Promise<boolean> {
    return super.verify({
      proof: new Uint8Array(proof.proof),
      publicInputs: proof.publicInputs,
    })
  }

  /**
   * Parse public inputs from a withdraw proof
   */
  parseData(publicInputs: string[]): ParsedWithdrawData {
    return {
      nullifierHash: publicInputs[0],
      merkleRoot: publicInputs[1],
      withdrawAmount: publicInputs[2],
      recipient: publicInputs[3],
    }
  }
}

/**
 * Convert an Ethereum address to a bigint for the circuit
 */
export function addressToBigInt(address: string): bigint {
  // Remove 0x prefix and convert to bigint
  return BigInt(address)
}

/**
 * Convert a bigint back to an Ethereum address
 */
export function bigIntToAddress(value: bigint): string {
  return `0x${value.toString(16).padStart(40, '0')}`
}
