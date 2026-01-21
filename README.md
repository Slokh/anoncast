# AnonPool

A privacy-preserving token pool with ZK-proof-based transfers and auctions on Base.

## Overview

AnonPool enables anonymous token transfers using zero-knowledge proofs. Users deposit tokens and receive cryptographic commitments that can be spent without revealing their identity. The system includes:

- **Privacy Pool**: Deposit tokens, receive commitments, withdraw or transfer anonymously
- **Auction System**: Slot-based auction for anonymous bidding with operator-controlled settlement
- **ZK Circuits**: Noir circuits for proving ownership without revealing secrets

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  Frontend                                     │
│                              (apps/web)                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│  Privacy Wallet Hook  │  Auction UI  │  Proof Freshness Warnings             │
└───────────┬───────────────────┬──────────────────────────────────────────────┘
            │                   │
            ▼                   ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                             @anon/pool                                        │
│                      (packages/pool)                                          │
├───────────────────────────────────────────────────────────────────────────────┤
│  Transfer/Withdraw Proofs  │  Merkle Tree  │  Note Management                │
│  ZK Circuits (Noir)        │  Privacy Wallet│  Commitment Schemes            │
└───────────┬───────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           Smart Contracts                                     │
│                        (packages/contracts)                                   │
├───────────────────────────────────────────────────────────────────────────────┤
│  AnonPool.sol         │  AuctionSpender.sol    │  Verifiers (auto-generated)  │
│  (deposits/withdraws) │  (rate-limited settle) │  (TransferVerifier,          │
│                       │                        │   WithdrawVerifier)          │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
├── apps/
│   └── web/                      # Next.js frontend
│       ├── src/
│       │   ├── app/              # App router pages & API routes
│       │   ├── components/       # React components (auction, proof warnings)
│       │   ├── hooks/            # Privacy wallet hook
│       │   └── config/           # Chain configuration
│
├── packages/
│   ├── pool/                     # @anon/pool - ZK circuits & utilities
│   │   ├── src/
│   │   │   ├── circuits/         # Noir circuits
│   │   │   │   ├── transfer/     # Transfer circuit (spend + change)
│   │   │   │   └── withdraw/     # Withdraw circuit (full exit)
│   │   │   ├── transfer.ts       # Proof generation, Merkle tree
│   │   │   └── privacy-wallet.ts # Deterministic note derivation
│   │   └── scripts/
│   │       └── generate-verifiers.sh  # Auto-generate Solidity verifiers
│   │
│   └── contracts/                # Solidity smart contracts
│       ├── src/
│       │   ├── AnonPool.sol      # Main privacy pool
│       │   ├── AuctionSpender.sol# Rate-limited transfer wrapper
│       │   └── verifiers/        # Auto-generated ZK verifiers
│       └── test/                 # Foundry tests
```

## Key Components

### ZK Circuits (Noir)

- **Transfer Circuit**: Proves ownership of a note and creates output + change notes
- **Withdraw Circuit**: Proves ownership and authorizes withdrawal to a specific address
- Both use keccak256 hashing with BN254 field arithmetic for Solidity compatibility

### Smart Contracts

- **AnonPool**: Core privacy pool with deposit/withdraw/transfer functions
- **AuctionSpender**: Slot-based rate limiter for operator-controlled settlements
- **Verifiers**: Auto-generated from Noir circuits using Barretenberg

### Frontend

- **Privacy Wallet Hook**: Manages notes, generates proofs, tracks balances
- **Proof Freshness Warnings**: Alerts users when their proof roots are expiring
- **Auction UI**: Bidding interface with real-time slot tracking

## Development

### Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime
- [Foundry](https://book.getfoundry.sh/) - Solidity development
- [Nargo](https://noir-lang.org/) - Noir compiler (v0.38.0+)
- [Barretenberg](https://github.com/AztecProtocol/aztec-packages) - ZK proof backend

### Setup

```bash
# Install dependencies
bun install

# Build ZK circuits
cd packages/pool && bun run build

# Build contracts
cd packages/contracts && forge build

# Run development server
bun run dev
```

### Testing

```bash
# Run circuit tests
cd packages/pool && bun run test:circuit

# Run contract tests
cd packages/contracts && forge test

# Run all tests
bun run test
```

### Generate Verifiers

After modifying circuits, regenerate the Solidity verifiers:

```bash
cd packages/pool && bun run generate:verifiers
```

## Environment Variables

Create `.env.local` in `apps/web/`:

```env
# Network (set to 'true' for Base Sepolia testnet)
NEXT_PUBLIC_TESTNET=false

# Contract addresses
NEXT_PUBLIC_POOL_CONTRACT=0x...
NEXT_PUBLIC_AUCTION_CONTRACT=0x...

# Testnet token (only if NEXT_PUBLIC_TESTNET=true)
NEXT_PUBLIC_TESTNET_ANON_TOKEN=0x...

# RPC URLs
NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_TESTNET_RPC_URL=https://sepolia.base.org

# API Keys
NEYNAR_API_KEY=
NEYNAR_SIGNER_UUID=
UPLOAD_API_KEY=
```

## Documentation

- [Proof Freshness Guide](packages/pool/PROOF_FRESHNESS.md) - Understanding root expiration
- [Verifier Generation](packages/contracts/src/verifiers/README.md) - Audit & deployment checklist
- [E2E Testing](docs/E2E_TESTING.md) - Full integration test checklist

## Security

This project uses ZK proofs for privacy. Key security properties:

- **Commitment Binding**: Notes are bound to their amount via `hash(hash(secret, nullifier), amount)`
- **Nullifier Uniqueness**: Each note can only be spent once
- **Root Expiration**: Proofs expire after ~1000 deposits (see PROOF_FRESHNESS.md)
- **Rate Limiting**: AuctionSpender limits one settlement per hourly slot

## License

MIT
