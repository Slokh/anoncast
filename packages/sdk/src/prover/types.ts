// Prover types for ZK proof generation

export type ProverMode = 'main' | 'server'

export type ProofInput = {
  note: {
    secret: bigint
    nullifier: bigint
    commitment: bigint
    amount: bigint
    leafIndex: number
    timestamp: number
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

// Serialized version for JSON transport (bigints as strings)
export type SerializedProofInput = {
  note: {
    secret: string
    nullifier: string
    commitment: string
    amount: string
    leafIndex: number
    timestamp: number
  }
  merklePath: string[]
  merkleIndices: number[]
  merkleRoot: string
  recipient: string
}
