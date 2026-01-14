# Anonworld Codebase Analysis

## Project Overview

Anonworld is a **zero-knowledge credential-based anonymous posting platform** that allows users to post anonymously while proving they meet certain criteria (token holdings, Farcaster identity, etc.) without revealing their identity.

**Core Value Proposition:** Post anonymously using ZK proofs to verify credentials (e.g., "I hold at least 100 ANON tokens") without revealing which wallet address you are.

**Tech Stack:**
- **Runtime:** Bun
- **Frontend:** Next.js 14 + Tamagui (cross-platform UI)
- **Backend:** Elysia (Bun web framework)
- **Database:** PostgreSQL + Drizzle ORM
- **Caching:** Redis
- **ZK Proofs:** Noir circuits + Aztec Barretenberg (UltraHonk backend)
- **Web3:** Wagmi, Viem, RainbowKit
- **Social:** Farcaster (Neynar API), Twitter API v2

---

## Architecture Overview

### Monorepo Structure

```
/
├── apps/
│   ├── anonworld/          # Main Next.js application
│   ├── anoncast/           # Farcaster-focused app (older)
│   └── farcaster/          # Farcaster frames app
├── packages/
│   ├── @anonworld/api/     # Elysia backend server
│   ├── @anonworld/credentials/  # ZK circuits & verifiers
│   ├── @anonworld/react/   # Shared React components & hooks
│   ├── @anonworld/ui/      # Tamagui component library
│   ├── @anonworld/sdk/     # SDK for API interaction
│   └── @anonworld/common/  # Shared types & utilities
```

---

## Credential System (ZK Proofs)

### What It Does

Users create "credentials" by generating zero-knowledge proofs that verify:
1. **ERC20 Balance:** "I hold ≥ X tokens of contract Y on chain Z"
2. **ERC721 Balance:** "I hold ≥ X NFTs from collection Y on chain Z"
3. **Native Balance:** "I hold ≥ X ETH on chain Z"
4. **Farcaster FID:** "My Farcaster FID is ≤ X" (proves early adopter status)

### How Circuits Work

Each circuit uses Noir language and proves:

```
1. ECDSA Recovery: Recover Ethereum address from signature + message hash
2. Merkle Proof Verification: Verify storage/account proof against block state root
3. Balance Assertion: Verify claimed balance ≤ actual on-chain balance
```

**Token Balance Circuit Inputs:**
- Signature (64 bytes - r,s from ECDSA)
- Message hash (32 bytes)
- Public key X/Y coordinates
- Storage proof (7 Merkle nodes max)
- Storage leaf (RLP-encoded value)
- Token address, balance slot, chain ID, block number

**Public Outputs:**
- `(verified_balance, chain_id, block_number, token_address, balance_slot, storage_hash[32])`

### Proof Generation Flow

```
1. User connects wallet via RainbowKit
2. Frontend fetches current balance via Zerion/RPC
3. User sets threshold (e.g., "Prove I have ≥ 100 tokens")
4. Frontend gets storage proof via eth_getProof RPC
5. User signs message with wallet
6. Circuit generates UltraHonk proof client-side
7. Proof + public inputs sent to backend
8. Backend verifies proof and validates against current block state
9. Credential stored in database linked to user's vault
```

### Key Files

- `/packages/credentials/src/verifiers/token-balance/circuit/src/main.nr` - Token balance circuit
- `/packages/credentials/src/verifiers/native-balance/circuit/src/main.nr` - Native balance circuit
- `/packages/credentials/src/verifiers/farcaster-fid/circuit/src/main.nr` - FID circuit
- `/packages/credentials/src/verifiers/noir-lib/` - Shared crypto utilities (ecrecover, RLP, Merkle)
- `/packages/credentials/src/utils/circuit.ts` - Circuit wrapper (proof generation/verification)

### Circuit Versions

- Token Balance: v0.1.5 (current)
- Native Balance: v0.1.2 (current)
- Farcaster FID: v0.1.0 (current)

Compiled artifacts in `circuit/target/[version]/main.json` and `vkey.json`.

---

## Authentication System

### Passkey-Based Auth (WebAuthn P256)

Users authenticate anonymously using device passkeys:

```
1. User clicks "Login"
2. Frontend generates nonce: crypto.randomUUID()
3. Backend returns challenge for nonce
4. If first time: WebAuthnP256.createCredential() - creates new passkey
   If returning: WebAuthnP256.sign() - signs challenge with existing passkey
5. Backend verifies signature, returns JWT
6. JWT stored in localStorage as 'anon:auth:v1'
```

**No email, no password, no username required.** Identity is tied to device passkey.

### Vaults

Vaults group credentials under an optional username/avatar:
- User can have multiple vaults (personas)
- Credentials can be moved between vaults
- Posts show vault identity if credential is in a vault

---

## API Structure

### Main Routes

| Route | Purpose |
|-------|---------|
| `POST /actions/execute` | Execute actions (create post, copy to Twitter, etc.) |
| `GET /posts/{hash}` | Get post details |
| `GET /feeds/{fid}/trending` | Get trending feed |
| `GET /feeds/{fid}/new` | Get new posts feed |
| `POST /credentials` | Submit and verify ZK proof |
| `POST /auth/challenge` | Get authentication challenge |
| `POST /auth/create` | Register new passkey |
| `POST /auth/authenticate` | Login with passkey |
| `GET /communities` | List communities |
| `POST /upload` | Upload images |
| `GET /wallet/{address}/fungibles` | Get wallet tokens (Zerion) |

### Action System

All user interactions are modeled as "actions" with credential requirements:

```typescript
// Action types
CREATE_POST           // Create post on Farcaster
COPY_POST_TWITTER     // Cross-post to Twitter
COPY_POST_FARCASTER   // Copy to another Farcaster account
DELETE_POST_TWITTER   // Remove from Twitter
DELETE_POST_FARCASTER // Remove from Farcaster
```

**Execution Flow:**
```
1. Client calls POST /actions/execute with:
   - actions: [{actionId, data, credentials}]
2. Backend validates credential requirements
3. Backend executes action (e.g., creates cast via Neynar)
4. Backend stores post + credential relationships
5. Returns result with post hash
```

### External Services

- **Neynar:** Farcaster API (create casts, get users, etc.)
- **Twitter API v2:** Tweet posting/deletion
- **Zerion:** Wallet token/NFT data
- **SimpleHash:** NFT collection data
- **Alchemy:** Blockchain RPC

---

## Database Schema

### Core Tables

**`posts`**
```sql
hash (PK)          -- Farcaster cast hash
fid                -- Author's Farcaster ID
data (JSONB)       -- {text, reply, links[], images[]}
reveal_hash        -- Optional hash for author reveal
reveal_metadata    -- Reveal data after uncovered
deleted_at         -- Soft delete
```

**`credential_instances`**
```sql
id (PK)            -- Credential instance ID
hash               -- Proof hash (unique identifier)
type               -- ERC20_BALANCE | ERC721_BALANCE | NATIVE_BALANCE | FARCASTER_FID
credential_id      -- Human-readable ID (e.g., "ERC20_BALANCE:8453:0x...")
metadata (JSONB)   -- Type-specific: {chainId, tokenAddress, balance} or {fid}
proof (JSONB)      -- {proof: number[], publicInputs: string[]}
verified_at        -- Block timestamp when verified
vault_id           -- Optional vault association
parent_id          -- For credential re-verification chains
```

**`post_credentials`**
```sql
post_hash          -- Links to posts.hash
credential_id      -- Links to credential_instances.id
```

**`vaults`**
```sql
id (PK)
passkey_id         -- Owner's passkey
username           -- Optional display name
image_url          -- Optional avatar
```

**`communities`**
```sql
id (PK)
name, description, image_url
token_id           -- Required token for access
fid                -- Community Farcaster account
passkey_id         -- Manager (optional)
```

**`actions`**
```sql
id (PK)
type               -- Action type
credential_id      -- Single credential requirement
credential_requirement -- Complex requirement (chainId, tokenAddress, minimumBalance)
credentials        -- Array of requirements
community_id       -- Optional community association
```

**`post_relationships`**
```sql
post_hash, target, target_account, target_id
-- Links posts to copies on other platforms (Twitter, other Farcaster accounts)
```

### Key Patterns

- **Soft deletes:** `deleted_at` column on posts, credentials, relationships
- **JSONB flexibility:** Metadata stored as JSONB for schema evolution
- **Composite keys:** `post_relationships` uses (post_hash, target, target_account)

---

## Frontend Architecture

### Main User Flows

**1. Authentication:**
```
User clicks Auth → Dialog opens → Creates/uses passkey → JWT stored → Session active
```

**2. Credential Creation:**
```
User opens New Credential → Selects type → Connects wallet →
Selects token → Sets threshold → Signs message →
Proof generated client-side → Submitted to backend → Credential stored
```

**3. Post Creation:**
```
User opens New Post → Selects credentials → Writes text →
Optional: adds image/link/reply → Submits →
Action executed with credentials → Post created on Farcaster →
Stored in DB with credential links
```

### Key Components

**Providers (Context Hierarchy):**
```
TamaguiProvider
└── WagmiProvider (wallet)
    └── QueryClientProvider (data fetching)
        └── SDKProvider
            └── AuthProvider (passkey auth)
                └── CredentialsProvider (credential management)
```

**Key Hooks:**
- `useAuth()` - Authentication state and methods
- `useCredentials()` - Credential CRUD and vault management
- `useSDK()` - SDK instance and wallet connector
- `useExecuteActions()` - Action execution with validation
- `usePost()`, `useTrendingPosts()`, etc. - Data fetching

### Credential Forms

Each credential type has its own form:
- `/packages/react/src/components/credentials/new/forms/native-balance/`
- `/packages/react/src/components/credentials/new/forms/erc20-balance/`
- `/packages/react/src/components/credentials/new/forms/erc721-balance/`
- `/packages/react/src/components/credentials/new/forms/farcaster-fid/`

---

## Key Integration Points

### Farcaster (via Neynar)

```typescript
// Create a cast (post)
neynar.createCast({
  fid: number,
  text: string,
  embeds: [{url: string}],
  quote?: string,
  parent?: string
})

// Get user data
neynar.getUser(fid)
neynar.getBulkUsersByFids(fids)
neynar.getBulkUsersByAddresses(addresses)
```

### Twitter

```typescript
// Post tweet
twitter.postTweet(username, {
  text: string,
  images: string[], // up to 4
  quoteTweetId?: string,
  replyToTweetId?: string
})
```

### Zerion (Wallet Data)

```typescript
// Get wallet tokens
GET /wallet/{address}/fungibles
// Returns token positions with balances
```

### Storage Slot Discovery

For ERC20 balance proofs, need to find where balances are stored:

```typescript
// POST /evm/storage-slot
// Tries slots 0-200 with keccak256(address || slot)
// Finds slot where stored value == holder's balance
// Caches result
```

---

## Content Moderation

**CreatePost filters:**
- INVALID_REGEXES blocks offensive content
- Blocks slurs in multiple languages + unicode variants

**CopyPost restrictions:**
- Blocks promotion of token launches (@clanker mentions)
- Blocks DEX links (dexscreener, dextools)
- Blocks contract addresses (0x...)
- Blocks token tickers ($TICKER except $ANON)

---

## Caching Strategy (Redis)

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `feed:trending:{fid}` | 1h | Trending feed cache |
| `feed:new:{fid}` | 1h | New posts cache |
| `casts:{hashes}` | 24h | Batch cast data |
| `storage-slot:{chain}:{addr}` | 30d | Balance slot cache |
| `action:occurred:{id}:{hash}` | 1h | Idempotency |

---

## Communities System

Communities are token-gated groups with shared posting accounts:

```
1. Community created with token requirement
2. COPY_POST_FARCASTER action created with credential requirement
3. Users with required tokens can post to community account
4. Posts copied from user's anonymous post to community Farcaster
```

---

## Reveal Mechanism

Optional feature allowing anonymous posters to reveal identity later:

```
1. User sets "reveal phrase" when creating post
2. Hash of phrase stored with post
3. Later, user can reveal by providing phrase + signature
4. Backend verifies: hash(phrase) == stored_hash
5. Reveal metadata stored, author visible
```

---

## Environment Variables

```
DATABASE_URL         # PostgreSQL connection
REDIS_URL           # Redis connection
ALCHEMY_API_KEY     # Blockchain RPC
ZERION_API_KEY      # Wallet data
SIMPLEHASH_API_KEY  # NFT data
NEYNAR_API_KEY      # Farcaster API
TWITTER_*           # Twitter API credentials
JWT_SECRET          # Auth token signing
NEXT_PUBLIC_API_URL # Frontend API endpoint
```

---

## What Can Be Simplified for New Project

Based on this analysis, here are components that could be removed for a streamlined anonymous posting experience:

### Features to Keep (Core)
- ZK credential system (proof generation/verification)
- Passkey authentication
- Basic post creation with credentials
- Farcaster integration for posting

### Features to Potentially Remove
- **Communities system** - Adds complexity with token-gated groups
- **Twitter integration** - Cross-posting adds maintenance burden
- **Leaderboard** - Gamification not essential
- **Multiple credential types** - Could focus on just ERC20 or native balance
- **Vaults** - Multiple personas adds complexity
- **Reveal mechanism** - Optional feature
- **Copy actions** - Cross-posting to other accounts
- **NFT/ERC721 support** - Could focus on fungible tokens only
- **Farcaster FID credentials** - Could focus on token-based only
- **Multiple apps** (anoncast, farcaster) - Consolidate to one

### Simplified Architecture

```
New Project:
├── app/                    # Single Next.js app
├── packages/
│   ├── api/               # Elysia backend (simplified)
│   ├── credentials/       # Just ERC20/native balance circuits
│   └── common/            # Shared types
```

**Core Flow:**
1. Connect wallet
2. Create credential (prove token balance)
3. Post anonymously (credential attached)
4. View anonymous posts with credential badges

This reduces the codebase significantly while maintaining the core value proposition: **anonymous posting with ZK-verified credentials.**
