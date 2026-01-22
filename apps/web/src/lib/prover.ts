// Prover utilities with two modes:
// - main: Run on main thread using browser WASM
// - server: Run on server via API endpoint using native nargo + bb CLI

export type ProverMode = 'main' | 'server'

export type ProofInput = {
  note: {
    secret: bigint
    nullifier: bigint
    commitment: bigint
    amount: bigint
    leafIndex: number
  }
  merklePath: bigint[]
  merkleIndices: number[]
  merkleRoot: bigint
  recipient: bigint
}

export type ProofResult = {
  verifierLoadTime: number
  proofGenerationTime: number
  proofSize: number
  proof: number[]
  publicInputs: string[]
}

// ============ Client (Main Thread) Prover ============

let mainVerifierPromise: Promise<any> | null = null

async function getMainVerifier(coldStart: boolean = false) {
  if (coldStart || !mainVerifierPromise) {
    mainVerifierPromise = (async () => {
      const [{ WithdrawVerifier }, circuit, vkey] = await Promise.all([
        import('@anon/pool'),
        import('@anon/pool/circuits/withdraw/target/anon_withdraw.json'),
        import('@anon/pool/circuits/withdraw/target/vk.json'),
      ])
      return new WithdrawVerifier(circuit.default || circuit, vkey.default || vkey)
    })()
  }
  return mainVerifierPromise
}

async function generateProofClient(
  input: ProofInput,
  coldStart: boolean = false
): Promise<ProofResult> {
  const verifierStart = performance.now()
  const verifier = await getMainVerifier(coldStart)
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

// ============ Server API Prover ============

async function generateProofServer(input: ProofInput): Promise<ProofResult> {
  // Serialize BigInts to strings for JSON transport
  const serializedInput = {
    note: {
      secret: input.note.secret.toString(),
      nullifier: input.note.nullifier.toString(),
      commitment: input.note.commitment.toString(),
      amount: input.note.amount.toString(),
      leafIndex: input.note.leafIndex,
    },
    merklePath: input.merklePath.map(p => p.toString()),
    merkleIndices: input.merkleIndices,
    merkleRoot: input.merkleRoot.toString(),
    recipient: input.recipient.toString(),
  }

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
