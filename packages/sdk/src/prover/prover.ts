// Client-side (main thread) prover using browser WASM
// For server-side proofs, use the Next.js API route with serializeProofInput

import type { ProofInput, ProofResult, SerializedProofInput } from './types'
import { WithdrawVerifier } from '../core/withdraw'

// Cache for verifier instance
let mainVerifierPromise: Promise<WithdrawVerifier> | null = null

// Dynamic imports for circuit artifacts
async function loadCircuitArtifacts() {
  // These must be dynamically imported since they're JSON files
  const [circuit, vkey] = await Promise.all([
    import('@anon/protocol/circuits/withdraw/target/anon_withdraw.json'),
    import('@anon/protocol/circuits/withdraw/target/vk.json'),
  ])
  return {
    circuit: circuit.default || circuit,
    vkey: vkey.default || vkey,
  }
}

/**
 * Get or create the withdraw verifier instance
 * @param coldStart - If true, forces recreation of the verifier
 */
export async function getWithdrawVerifier(coldStart: boolean = false): Promise<WithdrawVerifier> {
  if (coldStart || !mainVerifierPromise) {
    mainVerifierPromise = (async () => {
      const { circuit, vkey } = await loadCircuitArtifacts()
      return new WithdrawVerifier(circuit, vkey)
    })()
  }
  return mainVerifierPromise
}

/**
 * Generate a withdraw proof using the browser WASM prover
 * @param input - The proof input data
 * @param coldStart - If true, forces recreation of the verifier
 */
export async function generateProofClient(
  input: ProofInput,
  coldStart: boolean = false
): Promise<ProofResult> {
  const verifierStart = performance.now()
  const verifier = await getWithdrawVerifier(coldStart)
  const verifierLoadTime = performance.now() - verifierStart

  const proofStart = performance.now()
  const proofData = await verifier.generateSolidityWithdrawProof(input)
  const proofGenerationTime = performance.now() - proofStart

  return {
    verifierLoadTime,
    proofGenerationTime,
    proofSize: proofData.proof.length,
    proof: proofData.proof,
    publicInputs: proofData.publicInputs,
  }
}

/**
 * Serialize proof input for JSON transport (bigints to strings)
 */
export function serializeProofInput(input: ProofInput): SerializedProofInput {
  return {
    note: {
      secret: input.note.secret.toString(),
      nullifier: input.note.nullifier.toString(),
      commitment: input.note.commitment.toString(),
      amount: input.note.amount.toString(),
      leafIndex: input.note.leafIndex,
      timestamp: input.note.timestamp,
    },
    merklePath: input.merklePath.map(p => p.toString()),
    merkleIndices: input.merkleIndices,
    merkleRoot: input.merkleRoot.toString(),
    recipient: input.recipient.toString(),
  }
}

/**
 * Deserialize proof input from JSON transport (strings to bigints)
 */
export function deserializeProofInput(input: SerializedProofInput): ProofInput {
  return {
    note: {
      secret: BigInt(input.note.secret),
      nullifier: BigInt(input.note.nullifier),
      commitment: BigInt(input.note.commitment),
      amount: BigInt(input.note.amount),
      leafIndex: input.note.leafIndex,
      timestamp: input.note.timestamp,
    },
    merklePath: input.merklePath.map(p => BigInt(p)),
    merkleIndices: input.merkleIndices,
    merkleRoot: BigInt(input.merkleRoot),
    recipient: BigInt(input.recipient),
  }
}
