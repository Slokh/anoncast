# Claude Code Guidelines for AnonCast

This document contains project-specific instructions for Claude Code when working with this codebase.

## Project Overview

AnonCast is a privacy-preserving auction system that allows anonymous posting on social platforms. It uses:
- **Noir circuits** for zero-knowledge proofs (transfer and withdraw operations)
- **Solidity contracts** for the AnonPool and AuctionSpender
- **Next.js 16** frontend with React 19 and wagmi for wallet integration
- **Uniswap V3** integration for token swaps on Base

## Package Manager

**Always use `bun`, not `pnpm` or `npm`.**

```bash
bun install        # Install dependencies
bun run <script>   # Run scripts
bun test           # Run tests
```

## Common Commands

### Development
```bash
# Start local development (Anvil fork + contract deployment + database reset)
bun run dev:local

# Start Next.js dev server only (assumes contracts already deployed)
bun run dev

# Build the web app
bun run build
```

### Testing
```bash
# Run Solidity contract tests
bun run test:contracts

# Run Noir circuit tests
bun run test:circuits

# Run withdraw e2e tests (isolated test server)
bun run test:withdraw

# Run auction e2e tests (isolated test server)
bun run test:auction
```

### Circuits
```bash
# Build circuits and regenerate Solidity verifiers
bun run build:circuits
```

### Code Quality
```bash
bun run lint          # Run ESLint
bun run format        # Format with Prettier
bun run format:check  # Check formatting
```

## Repository Structure

```
anon/
├── apps/
│   └── web/                    # Next.js frontend (@anon/web)
│       ├── src/
│       │   ├── app/            # Next.js App Router pages and API routes
│       │   ├── components/     # React components
│       │   │   ├── auction/    # Auction-specific components (post-form, buy-modal, etc.)
│       │   │   └── ui/         # Shared UI components (dialog, card, etc.)
│       │   ├── config/         # Chain config, contract ABIs, addresses
│       │   ├── hooks/          # React hooks (use-deposit, use-swap, use-withdraw, etc.)
│       │   ├── lib/            # Utilities (prover, db)
│       │   ├── providers/      # React context providers (privacy-wallet)
│       │   └── services/       # External service integrations
│       └── data/               # SQLite database files (gitignored)
├── packages/
│   ├── protocol/               # Smart contracts + Noir circuits (@anon/protocol)
│   │   ├── contracts/          # Solidity contracts
│   │   │   ├── AnonPool.sol    # Main privacy pool contract
│   │   │   ├── AuctionSpender.sol
│   │   │   └── verifiers/      # Auto-generated from circuits
│   │   ├── circuits/           # Noir ZK circuits
│   │   │   ├── transfer/       # Transfer circuit (spending notes)
│   │   │   └── withdraw/       # Withdraw circuit (exiting pool)
│   │   ├── script/             # Foundry deployment scripts
│   │   └── test/               # Solidity tests
│   └── sdk/                    # TypeScript SDK (@anon/sdk)
│       └── src/
│           ├── core/           # Verifiers, wallet, merkle tree
│           ├── config/         # Chain configs, addresses
│           ├── prover/         # Proof generation utilities
│           └── blockchain/     # On-chain interaction helpers
├── scripts/                    # Shell scripts for dev tooling
│   ├── local-dev.sh            # Full local dev setup
│   ├── test-auction.sh         # Isolated auction tests
│   └── test-withdraw.sh        # Isolated withdraw tests
└── exports/                    # Pre-generated circuit artifacts
```

## Core Files Reference

### Frontend Hooks
- `apps/web/src/hooks/use-deposit.ts` - Token deposit to privacy pool
- `apps/web/src/hooks/use-withdraw.ts` - Privacy pool withdrawals
- `apps/web/src/hooks/use-swap.ts` - Uniswap V3 token swaps (ETH/USDC → ANON)
- `apps/web/src/hooks/use-token-price.ts` - ANON price fetching and USD formatting
- `apps/web/src/hooks/use-proof-mode.ts` - Client vs server proof generation toggle

### Privacy Wallet
- `apps/web/src/providers/privacy-wallet.tsx` - Main privacy wallet React context
- `packages/sdk/src/core/privacy-wallet.ts` - Core wallet logic (non-React)

### API Routes
- `apps/web/src/app/api/auction/current/route.ts` - Get current auction state
- `apps/web/src/app/api/auction/bid/route.ts` - Submit a bid
- `apps/web/src/app/api/prove/withdraw/route.ts` - Server-side proof generation
- `apps/web/src/app/api/faucet/route.ts` - Local dev token faucet

### Database
- `apps/web/src/lib/db/types.ts` - Repository interface
- `apps/web/src/lib/db/sqlite.ts` - SQLite implementation
- `apps/web/src/lib/db/index.ts` - Repository factory

### Contracts
- `packages/protocol/contracts/AnonPool.sol` - Main pool contract
- `packages/protocol/contracts/AuctionSpender.sol` - Auction spending logic

## Code Style Guidelines

### General
- Use TypeScript for all new code
- Prefer functional components with hooks
- Use `'use client'` directive for client-side components
- Keep components focused and single-purpose
- Avoid over-engineering - make minimal changes to accomplish the task

### Naming Conventions
- Files: `kebab-case.ts` or `kebab-case.tsx`
- Components: `PascalCase`
- Hooks: `use-kebab-case.ts` exporting `useCamelCase`
- Types: `PascalCase`

### Imports
- Use `@/` alias for src imports (e.g., `@/components/ui/card`)
- Use workspace imports for packages (e.g., `@anon/sdk/core`)

### React Patterns
- Use `useCallback` for functions passed as props
- Use `useEffect` dependencies properly
- Prefer controlled components
- Use custom events for cross-component communication (e.g., `auctionBidUpdate`)

### Error Handling
- Always handle promise rejections
- Show user-friendly error messages
- Log detailed errors to console for debugging

## Commit Messages

Follow conventional commits format:
```
feat: add USD price display across all ANON amounts
fix: simplify proof mode labels to Fast vs Slow
refactor: restructure packages and add dev tools
```

Prefix with:
- `feat:` - New features
- `fix:` - Bug fixes
- `refactor:` - Code restructuring
- `docs:` - Documentation only
- `test:` - Test changes
- `chore:` - Build/tooling changes

## Branch Naming

Use descriptive branch names with prefixes:
- `feat/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `refactor/what-changed` - Refactoring

Default branch is `main`.

## Environment Setup

### Required Tools
- **bun** - Package manager and runtime
- **Node.js 20+** - JavaScript runtime
- **Foundry** (anvil, forge, cast) - Solidity development
- **nargo** - Noir compiler (install via noirup)
- **bb** - Barretenberg prover (install via bbup)

### Installing Noir Toolchain
```bash
# Install noirup
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash

# Install nargo
noirup

# Install bbup
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash

# Install bb
bbup
```

### Local Development Setup
```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start Anvil fork with contracts deployed
bun run dev:local

# 3. In another terminal, start the web app
bun run dev
```

The `local-dev.sh` script:
- Starts Anvil forking Base mainnet
- Deploys AnonPool and AuctionSpender contracts
- Funds test account with ANON tokens from a whale
- Updates `.env` with contract addresses
- Resets the SQLite database

### Test Account (Anvil #0)
- Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

## Unexpected Behaviors & Warnings

### Build Warnings
- **Multiple lockfiles warning**: The project has both root and app-level lockfiles. This causes a Next.js warning but doesn't affect functionality.

### Circuit Compilation
- Circuit builds can take 1-2 minutes
- Use `--skip-circuits` flag with `local-dev.sh` for faster startup if circuits haven't changed

### Database
- SQLite database is stored in `apps/web/data/`
- Database is reset when running `bun run dev:local`
- Test scripts use isolated databases that are cleaned up automatically

### Proof Generation
- Client-side proofs work in browser but can be slow (~30s)
- Server-side proofs require `bb` CLI installed and are faster (~5-10s)
- Use the Benchmark modal (dev mode only) to test proof performance

### Uniswap Integration
- The swap hook supports both ETH and USDC as input tokens
- Pool fee is 1% (10000 bps) for WETH/ANON and USDC/ANON pools
- Exact input and exact output swap modes are both supported

### Mock Bid System (Dev Only)
- In local dev mode, click the "Mock" button in the header to cycle through mock bid types
- This simulates existing bids for testing the auction flow

## Testing Notes

### E2E Tests
Test scripts (`test-withdraw.sh`, `test-auction.sh`) are isolated:
- Start a dedicated test server on a separate port
- Use separate test database files
- Clean up database files automatically on exit
- Do not interfere with the main dev server

### Contract Tests
Run with `bun run test:contracts` or directly with `forge test` in `packages/protocol/`.

### Circuit Tests
Run with `bun run test:circuits`. Requires nargo to be installed.

## API Reference

### Auction API
- `GET /api/auction/current` - Get current slot info and highest bid
- `POST /api/auction/bid` - Submit a bid with proof
- `GET /api/auction/history` - Get past auction results
- `POST /api/auction/settle` - Settle completed auction (cron)

### Proof API
- `POST /api/prove/withdraw` - Generate withdraw proof server-side

### Dev API
- `POST /api/faucet` - Get test tokens (local dev only)

## Token Information

- **ANON Token**: `0x0Db510e79909666d6dEc7f5e49370838c16D950f` (Base mainnet)
- **Decimals**: 18
- **WETH (Base)**: `0x4200000000000000000000000000000000000006`
- **USDC (Base)**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
