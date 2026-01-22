# @anon/sdk

TypeScript SDK for the AnonPool privacy system. Provides proof generation, wallet management, and blockchain interaction utilities.

## Overview

This package provides:

- **Core**: ZK verifiers, Merkle tree, note generation, cryptographic utilities
- **Config**: ABIs, contract addresses, chain configuration
- **Prover**: Client-side (WASM) and server-side proof generation
- **Blockchain**: Pool client for reading state and preparing transactions

## Installation

```bash
bun add @anon/sdk
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              @anon/sdk                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    core/     │  │   config/    │  │   prover/    │  │  blockchain/ │     │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤     │
│  │ • Verifiers  │  │ • ABIs       │  │ • Client gen │  │ • PoolClient │     │
│  │ • MerkleTree │  │ • Addresses  │  │ • Server gen │  │ • Tx helpers │     │
│  │ • Note utils │  │ • Chains     │  │ • Types      │  │ • Types      │     │
│  │ • Wallet     │  │              │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Modules

### Core (`@anon/sdk/core`)

ZK proof generation and note management utilities.

```typescript
import {
  // Verifiers
  TransferVerifier,
  WithdrawVerifier,

  // Merkle tree
  MerkleTree,
  MERKLE_DEPTH,

  // Note utilities
  generateNote,
  computeCommitment,
  computeNullifierHash,
  serializeNote,
  deserializeNote,

  // Types
  type Note,
  type RootFreshness,
  getRootFreshnessStatus,
  FRESHNESS_THRESHOLDS,
} from '@anon/sdk/core'
```

### Config (`@anon/sdk/config`)

Contract ABIs and chain configuration.

```typescript
import {
  // ABIs
  ERC20_ABI,
  ANON_POOL_ABI,

  // Chain utilities
  SUPPORTED_CHAIN_IDS,
  getChainConfig,
  getExplorerLink,

  // Addresses
  getContractAddresses,
} from '@anon/sdk/config'
```

### Prover (`@anon/sdk/prover`)

Proof generation with support for client-side (WASM) and server-side modes.

```typescript
import {
  generateProofClient,
  type ProverMode,
  type ProofInput,
  type ProofResult,
} from '@anon/sdk/prover'
```

### Blockchain (`@anon/sdk/blockchain`)

Pool client for reading on-chain state.

```typescript
import {
  AnonPoolClient,
  type PoolStats,
  type DepositParams,
  type WithdrawParams,
} from '@anon/sdk/blockchain'
```

## Usage Examples

### Generate a Deposit Note

```typescript
import { generateNote, computeCommitment } from '@anon/sdk/core'

// Generate a note for depositing 100 tokens
const amount = 100n * 10n ** 18n
const note = generateNote(amount)

console.log('Commitment:', note.commitment)
console.log('Secret:', note.secret)      // Keep private!
console.log('Nullifier:', note.nullifier) // Keep private!
```

### Build Merkle Tree and Generate Proof

```typescript
import { MerkleTree, WithdrawVerifier, MERKLE_DEPTH } from '@anon/sdk/core'

// Build tree from on-chain deposits
const tree = new MerkleTree(MERKLE_DEPTH)
for (const commitment of deposits) {
  tree.insert(commitment)
}

// Get proof for your note
const leafIndex = 0
const { path, indices } = tree.getProof(leafIndex)
const merkleRoot = tree.getRoot()

// Load circuit artifacts
const circuit = await import('@anon/protocol/circuits/withdraw/target/anon_withdraw.json')
const vkey = await import('@anon/protocol/circuits/withdraw/target/vk.json')

// Generate ZK proof
const verifier = new WithdrawVerifier(circuit, vkey)
const proof = await verifier.generateSolidityWithdrawProof({
  note: { ...myNote, leafIndex },
  merklePath: path,
  merkleIndices: indices,
  merkleRoot,
  recipient: BigInt(recipientAddress),
})
```

### Use Pool Client

```typescript
import { AnonPoolClient } from '@anon/sdk/blockchain'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
})

const poolClient = new AnonPoolClient(
  publicClient,
  '0xPoolAddress...',
  '0xTokenAddress...'
)

// Get pool statistics
const stats = await poolClient.getPoolStats()
console.log('Total deposits:', stats.totalDeposits)
console.log('Pool balance:', stats.poolBalance)

// Check if a root is valid
const isValid = await poolClient.isKnownRoot(merkleRoot)

// Get root freshness (deposits until expiry)
const freshness = await poolClient.getRootStatus(merkleRoot)
console.log('Deposits until expiry:', freshness.depositsUntilExpiry)
```

### Client-Side Proof Generation

```typescript
import { generateProofClient } from '@anon/sdk/prover'

const result = await generateProofClient({
  note: myNote,
  merklePath: path,
  merkleIndices: indices,
  merkleRoot,
  recipient: BigInt(recipientAddress),
})

console.log('Proof:', result.proof)
console.log('Public inputs:', result.publicInputs)
console.log('Time:', result.timing.totalTime, 'ms')
```

## Cryptographic Details

### Commitment Scheme

Notes use a nested hash commitment that binds the amount:

```
commitment = keccak256(keccak256(secret || nullifier) || amount) mod p
```

Where `p` is the BN254 field size.

### Nullifier Hash

Prevents double-spending:

```
nullifierHash = keccak256(nullifier) mod p
```

### Merkle Tree

- Depth: 20 levels (supports ~1M notes)
- Hash function: keccak256 (matching on-chain)
- Zero value: `keccak256("anon_pool") mod p`

## Types

### Note

```typescript
interface Note {
  secret: bigint
  nullifier: bigint
  commitment: bigint
  amount: bigint
  leafIndex: number
}
```

### RootFreshness

```typescript
interface RootFreshness {
  exists: boolean
  depositsAgo: number
  depositsUntilExpiry: number
}

const FRESHNESS_THRESHOLDS = {
  SAFE: 100,      // Green - plenty of buffer
  WARNING: 50,    // Yellow - consider regenerating
  URGENT: 10,     // Orange - regenerate soon
  CRITICAL: 0,    // Red - expired
}
```

### ProofResult

```typescript
interface ProofResult {
  proof: number[]
  publicInputs: string[]
  timing: {
    verifierLoadTime: number
    witnessGenTime: number
    proofGenerationTime: number
    totalTime: number
  }
}
```

## Exports Summary

### Main Entry (`@anon/sdk`)

```typescript
// Core
export { TransferVerifier, WithdrawVerifier } from './core'
export { MerkleTree, MERKLE_DEPTH } from './core'
export { generateNote, computeCommitment, computeNullifierHash } from './core'
export type { Note, RootFreshness } from './core'

// Config
export { ERC20_ABI, ANON_POOL_ABI } from './config'
export { getChainConfig, getContractAddresses } from './config'

// Blockchain
export { AnonPoolClient } from './blockchain'

// Prover
export { generateProofClient } from './prover'
export type { ProverMode, ProofInput, ProofResult } from './prover'
```

## Security Considerations

1. **Secret Storage**: Never expose `secret` or `nullifier` values
2. **Amount Binding**: Commitments MUST include the amount to prevent value manipulation
3. **Nullifier Uniqueness**: Each nullifier can only be spent once
4. **Root Expiration**: Proofs against old roots may fail (~1000 deposit history)
5. **Recipient Binding**: Withdraw proofs bind the recipient to prevent front-running

## License

MIT
