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
│  Privacy Wallet Provider  │  Auction UI  │  Proof Mode Selection             │
└───────────┬───────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                              @anon/sdk                                        │
│                          (packages/sdk)                                       │
├───────────────────────────────────────────────────────────────────────────────┤
│  core/          │  config/        │  prover/        │  blockchain/            │
│  - Verifiers    │  - ABIs         │  - Client-side  │  - Pool client          │
│  - Merkle tree  │  - Addresses    │  - Server-side  │  - Deposit/withdraw     │
│  - Note utils   │  - Chains       │    proof gen    │    helpers              │
└───────────┬───────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                            @anon/protocol                                     │
│                         (packages/protocol)                                   │
├───────────────────────────────────────────────────────────────────────────────┤
│  contracts/              │  circuits/               │  script/                │
│  - AnonPool.sol          │  - transfer/ (Noir)      │  - Deploy scripts       │
│  - AuctionSpender.sol    │  - withdraw/ (Noir)      │  - Verifier generation  │
│  - verifiers/ (auto-gen) │                          │                         │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
├── apps/
│   └── web/                      # Next.js frontend
│       ├── src/
│       │   ├── app/              # App router pages & API routes
│       │   ├── components/       # React components
│       │   ├── hooks/            # React hooks (thin wrappers around SDK)
│       │   └── providers/        # Context providers
│
├── packages/
│   ├── sdk/                      # @anon/sdk - TypeScript SDK
│   │   └── src/
│   │       ├── core/             # Verifiers, Merkle tree, note utils
│   │       ├── config/           # ABIs, addresses, chain config
│   │       ├── prover/           # Proof generation (client/server)
│   │       └── blockchain/       # Pool client, transaction helpers
│   │
│   └── protocol/                 # @anon/protocol - Contracts & circuits
│       ├── contracts/            # Solidity smart contracts
│       │   ├── AnonPool.sol      # Main privacy pool
│       │   ├── AuctionSpender.sol# Rate-limited transfer wrapper
│       │   └── verifiers/        # Auto-generated ZK verifiers
│       ├── circuits/             # Noir ZK circuits
│       │   ├── transfer/         # Transfer circuit
│       │   └── withdraw/         # Withdraw circuit
│       └── script/               # Deployment & generation scripts
│
├── scripts/                      # Development scripts
│   ├── local-dev.sh              # Start local environment
│   └── test-withdraw.ts          # E2E test script
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime
- [Foundry](https://book.getfoundry.sh/) - Solidity development
- [Nargo](https://noir-lang.org/) - Noir compiler (v1.0.0-beta.3+)
- [Barretenberg](https://github.com/AztecProtocol/aztec-packages) - ZK proof backend (`bb` CLI)

### Local Development

Start a complete local environment with one command:

```bash
# Start Anvil (Base mainnet fork), deploy contracts, fund test account
./scripts/local-dev.sh

# In another terminal, start the frontend
bun run dev
```

This will:
1. Start Anvil forking Base mainnet
2. Regenerate ZK verifiers
3. Deploy AnonPool and AuctionSpender contracts
4. Fund test account with 1,000 $ANON tokens
5. Create `.env.local` with contract addresses

### Manual Setup

```bash
# Install dependencies
bun install

# Build ZK circuits
cd packages/protocol && bun run build:circuits

# Build contracts
cd packages/protocol && bun run build

# Run development server
bun run dev
```

## Testing

```bash
# Run all tests
bun run test

# Contract tests (102 tests)
bun run test:contracts

# Circuit tests (19 tests)
bun run test:circuits

# End-to-end test (deposit + withdraw with ZK proof)
./scripts/local-dev.sh  # Start local env first
bun run test:e2e
```

### E2E Test Modes

The e2e test defaults to server-side proof generation (faster). Requires the Next.js server to be running (`bun run dev`):

```bash
# Server-side proof generation (~7s, default)
bun run test:e2e

# Client-side proof generation (~70s, no server needed)
bun run test:e2e --client
```

## Environment Variables

Copy `.env.example` to `.env` at the repository root:

```bash
cp .env.example .env
```

The `local-dev.sh` script automatically updates contract addresses in `.env` after deployment. See `.env.example` for all available options including:
- Network configuration (RPC URL for local or mainnet)
- Contract addresses (auto-updated by local-dev.sh)
- Deployment keys (for Foundry)
- API keys (Neynar, Twitter, etc.)

## Key Components

### ZK Circuits (Noir)

- **Transfer Circuit**: Proves ownership of a note and creates output + change notes
- **Withdraw Circuit**: Proves ownership and authorizes withdrawal to a specific address
- Both use keccak256 hashing with BN254 field arithmetic for Solidity compatibility

### Smart Contracts

- **AnonPool**: Core privacy pool with deposit/withdraw/transfer functions
- **AuctionSpender**: Slot-based rate limiter for operator-controlled settlements
- **Verifiers**: Auto-generated from Noir circuits using Barretenberg

### SDK

- **Core**: Verifiers, Merkle tree, note generation, commitment schemes
- **Config**: ABIs, contract addresses, chain configuration
- **Prover**: Client-side (WASM) and server-side (native bb) proof generation
- **Blockchain**: Pool client for reading state, transaction preparation

## Security

This project uses ZK proofs for privacy. Key security properties:

- **Commitment Binding**: Notes are bound to their amount via `hash(hash(secret, nullifier), amount)`
- **Nullifier Uniqueness**: Each note can only be spent once
- **Root Expiration**: Proofs expire after ~1000 deposits
- **Rate Limiting**: AuctionSpender limits one settlement per hourly slot

## Documentation

- [Protocol README](packages/protocol/README.md) - Contracts and circuits
- [SDK README](packages/sdk/README.md) - TypeScript SDK usage
- [Verifier Generation](packages/protocol/contracts/verifiers/README.md) - Audit checklist

## License

MIT
