# @anon/pool

Zero-knowledge proof utilities for the AnonPool privacy system. Includes Noir circuits, proof generation, Merkle tree management, and privacy wallet functionality.

## Overview

This package provides:

- **ZK Circuits**: Noir circuits for transfer and withdraw operations
- **Proof Generation**: TypeScript utilities for generating ZK proofs
- **Merkle Tree**: Client-side Merkle tree matching the on-chain structure
- **Privacy Wallet**: Deterministic note derivation and management
- **Verifier Generation**: Script to generate Solidity verifiers from circuits

## Installation

```bash
bun add @anon/pool
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           @anon/pool                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │  ZK Circuits     │    │  TypeScript      │    │  Privacy Wallet  │      │
│  │  (Noir)          │    │  Utilities       │    │                  │      │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤      │
│  │ • transfer/      │───▶│ • Proof gen      │◀──▶│ • Note derivation│      │
│  │ • withdraw/      │    │ • Merkle tree    │    │ • Balance tracking│     │
│  │                  │    │ • Hash functions │    │ • Chain sync     │      │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Circuits

### Transfer Circuit (`src/circuits/transfer/`)

Proves ownership of a note and authorizes a transfer with change:

**Private Inputs:**
- `secret`, `nullifier` - Note credentials
- `input_amount` - Amount in the input note
- `merkle_path`, `merkle_indices` - Merkle proof
- `change_secret`, `change_nullifier` - Change note credentials

**Public Inputs:**
- `nullifier_hash` - Hash of nullifier (prevents double-spend)
- `merkle_root` - Root being proven against
- `output_amount` - Amount to transfer
- `change_commitment` - Commitment for change note
- `change_amount` - Amount in change note
- `output_commitment` - Commitment for recipient

**Constraints:**
- Input commitment is in the Merkle tree
- `input_amount = output_amount + change_amount`
- Amounts are within valid range (< 2^128)
- Commitment scheme: `hash(hash(secret, nullifier), amount)`

### Withdraw Circuit (`src/circuits/withdraw/`)

Proves ownership and authorizes withdrawal to a specific address:

**Private Inputs:**
- `secret`, `nullifier` - Note credentials
- `amount` - Note amount
- `merkle_path`, `merkle_indices` - Merkle proof

**Public Inputs:**
- `nullifier_hash` - Hash of nullifier
- `merkle_root` - Root being proven against
- `withdraw_amount` - Amount to withdraw
- `recipient` - Address to receive funds

**Constraints:**
- Input commitment is in the Merkle tree
- `withdraw_amount <= amount`
- Recipient is bound to the proof (prevents front-running)
- Amount is within valid range (< 2^128)

## Usage

### Basic Transfer

```typescript
import {
  TransferVerifier,
  MerkleTree,
  generateNote,
  computeCommitment,
  prepareTransfer,
} from '@anon/pool'

// Load circuit artifacts
import circuit from '@anon/pool/circuits/transfer/target/anon_transfer.json'
import vkey from '@anon/pool/circuits/transfer/target/vkey.json'

// Create verifier
const verifier = new TransferVerifier(circuit, vkey)

// Generate a deposit note
const depositNote = generateNote(1000n * 10n ** 18n) // 1000 tokens

// After deposit is confirmed on-chain, prepare a transfer
const merkleTree = new MerkleTree()
merkleTree.insert(depositNote.commitment)

const outputNote = generateNote(100n * 10n ** 18n)
const { changeNote, merklePath, merkleIndices, merkleRoot } = prepareTransfer(
  { ...depositNote, leafIndex: 0, timestamp: Date.now() },
  merkleTree,
  100n * 10n ** 18n,
  outputNote.commitment
)

// Generate proof
const proof = await verifier.generateTransferProof({
  note: { ...depositNote, leafIndex: 0, timestamp: Date.now() },
  merklePath,
  merkleIndices,
  merkleRoot,
  outputAmount: 100n * 10n ** 18n,
  changeNote: { ...changeNote, leafIndex: -1, timestamp: Date.now() },
  outputCommitment: outputNote.commitment,
})
```

### Privacy Wallet

```typescript
import { PrivacyWallet, generateMasterSeed } from '@anon/pool/privacy-wallet'

// Create wallet from signature
const wallet = PrivacyWallet.fromSignature(
  signature,
  '0xPoolContract...',
  'https://mainnet.base.org'
)

// Sync with chain
await wallet.syncFromChain()

// Check balance
const balance = wallet.getBalance()
console.log(`Available: ${balance.available}`)

// Prepare a transfer
const transfer = await wallet.prepareTransfer(
  100n * 10n ** 18n, // output amount
  outputCommitment
)
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

## Scripts

### Build Circuits

```bash
bun run build
```

Compiles both transfer and withdraw circuits and generates verification keys.

### Generate Solidity Verifiers

```bash
bun run generate:verifiers
```

Generates `TransferVerifier.sol` and `WithdrawVerifier.sol` in `../contracts/src/verifiers/`.

### Run Circuit Tests

```bash
bun run test:circuit
```

Runs all Noir tests (19 total: 12 transfer + 7 withdraw).

## Exports

### From `@anon/pool` (transfer.ts)

```typescript
// Core types
export type { Note, SerializedNote, TransferInput, TransferProofData }

// Constants
export const MERKLE_DEPTH = 20

// Classes
export class TransferVerifier { ... }
export class MerkleTree { ... }

// Functions
export function generateNote(amount: bigint): Note
export function generateChangeNote(inputAmount: bigint, outputAmount: bigint): Note
export function generateOutputNote(amount: bigint): { outputNote: Note }
export function computeCommitment(secret: bigint, nullifier: bigint, amount: bigint): bigint
export function computeNullifierHash(nullifier: bigint): bigint
export function hashTwo(left: bigint, right: bigint): bigint
export function hashOne(value: bigint): bigint
export function serializeNote(note: Note): SerializedNote
export function deserializeNote(serialized: SerializedNote): Note
export function encodeNote(note: Note): string  // base64
export function decodeNote(encoded: string): Note
export function prepareTransfer(...): TransferData
```

### From `@anon/pool/privacy-wallet`

```typescript
// Types
export type { PrivacyWalletState, NoteState, WalletBalance }

// Classes
export class PrivacyWallet { ... }

// Functions
export function deriveNote(masterSeed: bigint, index: number, amount: bigint): Note
export function deriveClaimCredentials(masterSeed: bigint, slotId: number): ClaimCreds
export function generateMasterSeed(signature: string): bigint
export function saveWalletState(state: PrivacyWalletState): void
export function loadWalletState(): PrivacyWalletState | null
export function clearWalletState(): void
```

## Related Documentation

- [Proof Freshness Guide](./PROOF_FRESHNESS.md) - Understanding root expiration and regeneration
- [Verifier README](../contracts/src/verifiers/README.md) - Verifier generation and audit checklist

## Security Considerations

1. **Amount Binding**: Commitments MUST include the amount to prevent value manipulation
2. **Nullifier Uniqueness**: Each nullifier can only be spent once
3. **Root Expiration**: Proofs against old roots may fail (1000 root history)
4. **Recipient Binding**: Withdraw proofs bind the recipient to prevent front-running
5. **Field Overflow**: All values are reduced modulo the BN254 field size

## License

MIT
