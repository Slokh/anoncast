// Prover utilities with two modes:
// - main: Run on main thread using browser WASM (via SDK)
// - server: Run on server via API endpoint using native nargo + bb CLI

// Re-export types from SDK
export type { ProverMode, ProofInput, ProofResult } from '@anon/sdk/prover'

import {
  generateProofClient,
  serializeProofInput,
  type ProofInput,
  type ProofResult,
  type ProverMode,
} from '@anon/sdk/prover'

// ============ Server API Prover ============

async function generateProofServer(input: ProofInput): Promise<ProofResult> {
  // Serialize BigInts to strings for JSON transport
  const serializedInput = serializeProofInput(input)

  const response = await fetch('/api/prove/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serializedInput),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Server proof generation failed')
  }

  const data = await response.json()

  return {
    // For server mode, witness gen time is analogous to verifier load time
    verifierLoadTime: data.timing.witnessGenTime || 0,
    proofGenerationTime: data.timing.proofGenerationTime || 0,
    proofSize: data.proof.length,
    proof: data.proof,
    publicInputs: data.publicInputs,
  }
}

// ============ Unified API ============

export async function generateProof(
  input: ProofInput,
  mode: ProverMode,
  coldStart: boolean = false
): Promise<ProofResult> {
  switch (mode) {
    case 'main':
      return generateProofClient(input, coldStart)
    case 'server':
      return generateProofServer(input)
  }
}
