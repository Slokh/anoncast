# AnonPool Contracts

Privacy-preserving token pool with operator-controlled transfers. Users deposit tokens and receive commitments that can be spent via ZK proofs. Approved spenders (operators) can execute transfers on behalf of users for use cases like payments, subscriptions, and tipping.

## Architecture

### AnonPool.sol

The main contract implementing a privacy pool with the following features:

- **Deposits**: Users deposit tokens and receive a commitment: `hash(hash(secret, nullifier), amount)`
- **Withdrawals**: Users prove ownership via ZK proof and withdraw to any address
- **Transfers**: Approved spenders execute transfers on behalf of users, creating output notes for recipients
- **Merkle Tree**: 20-level tree (2^20 = 1M+ capacity) tracks all commitments
- **Nullifiers**: Prevent double-spending by tracking spent note hashes

### Key Components

```
┌─────────────────────────────────────────────────────────────┐
│                        AnonPool                              │
├─────────────────────────────────────────────────────────────┤
│  Deposits          │  Withdrawals        │  Transfers        │
│  ─────────         │  ───────────        │  ─────────        │
│  User deposits     │  User proves note   │  Spender proves   │
│  tokens + gets     │  ownership via ZK   │  user's note +    │
│  commitment        │  proof, withdraws   │  creates output   │
│                    │  to any address     │  + change notes   │
├─────────────────────────────────────────────────────────────┤
│                     Merkle Tree (depth=20)                   │
│  Tracks all commitments with O(1) root lookup                │
├─────────────────────────────────────────────────────────────┤
│                     Nullifier Registry                       │
│  Prevents double-spending                                    │
└─────────────────────────────────────────────────────────────┘
```

### Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Pausable**: Owner can pause all operations in emergencies
- **SafeERC20**: Safe token transfer handling
- **Fee-on-transfer support**: Measures actual received amounts
- **Root history**: Maintains last 1000 roots with proper invalidation
- **Zero address checks**: Validates all address inputs
- **Commitment collision prevention**: Rejects duplicate commitments

## Contracts

| Contract | Description |
|----------|-------------|
| `AnonPool.sol` | Main privacy pool contract |
| `AuctionSpender.sol` | Rate-limited spender for slot-based auctions |
| `TestANON.sol` | Test ERC20 token for testnet deployment |
| `verifiers/TransferVerifier.sol` | Auto-generated ZK verifier for transfers |
| `verifiers/WithdrawVerifier.sol` | Auto-generated ZK verifier for withdrawals |

### AuctionSpender.sol

A safety wrapper for AnonPool.transfer() that implements slot-based rate limiting:

- **One settlement per slot**: Prevents double-spending from compromised operator keys
- **Settlement window**: Configurable time window after each hourly slot ends
- **Immutable configuration**: Deploy new contract to change settings
- **Emergency controls**: Pausable by owner, with emergency token withdrawal

## Usage

### Build

```shell
# Development build (excludes large verifier contracts)
bun run build

# Full build including verifiers (requires FOUNDRY_PROFILE=verifiers)
bun run build:all
```

### Test

```shell
# Run all tests
bun run test

# With verbosity for detailed output
forge test -vvv --skip '*/TransferVerifier.sol' --skip '*/WithdrawVerifier.sol'
```

> **Note**: The auto-generated verifier contracts are very large and cause Yul stack issues with the default optimizer. They are excluded from regular builds and tests. For production deployment, use `bun run build:all` with the `verifiers` profile.

### Deploy

```shell
forge script script/Deploy.s.sol:DeployScript --rpc-url <RPC_URL> --private-key <PRIVATE_KEY> --broadcast
```

## Contract Interface

### For Users

```solidity
// Deposit tokens into the pool
function deposit(bytes32 commitment, uint256 amount) external;

// Withdraw tokens with ZK proof
function withdraw(
    bytes calldata proof,
    bytes32 nullifierHash,
    bytes32 root,
    uint256 amount,
    address recipient
) external;
```

### For Spenders (Operators)

```solidity
// Transfer on behalf of user (creates output + change notes)
function transfer(
    bytes calldata proof,
    bytes32 nullifierHash,
    bytes32 root,
    bytes32 outputCommitment,
    uint256 outputAmount,
    bytes32 changeCommitment,
    uint256 changeAmount
) external;
```

### For Owner

```solidity
// Manage approved spenders
function addSpender(address spender) external;
function removeSpender(address spender) external;

// Emergency controls
function pause() external;
function unpause() external;
```

### View Functions

```solidity
// Check commitment status
function getCommitmentData(bytes32 commitment) external view returns (bool exists, uint32 leafIndex);

// Batch check nullifiers
function batchCheckNullifiers(bytes32[] calldata nullifiers) external view returns (bool[] memory spent);

// Pool statistics
function getPoolStats() external view returns (
    uint256 totalDeposited,
    uint32 leafCount,
    bytes32 currentRoot,
    uint32 treeCapacity
);

// Merkle tree helpers
function isKnownRoot(bytes32 root) public view returns (bool);
function getLastRoot() public view returns (bytes32);
function getMerklePathIndices(uint32 leafIndex) external view returns (uint8[] memory pathIndices);
```

## Flow Example

### 1. User Deposits

```
User                              AnonPool
  │                                  │
  │ Generate secret + nullifier      │
  │ inner = hash(secret, nullifier)  │
  │ commitment = hash(inner, amount) │
  │                                  │
  │ ──── deposit(commitment, amt) ──►│
  │                                  │ Store commitment in Merkle tree
  │                                  │ Record noteAmounts[commitment]
  │ ◄─────── Deposit event ─────────│
```

### 2. Spender Transfers (e.g., for payment)

```
User                    Spender                    AnonPool
  │                        │                          │
  │ Generate ZK proof      │                          │
  │ (proves note ownership │                          │
  │  + authorizes transfer)│                          │
  │                        │                          │
  │ ── Send proof ────────►│                          │
  │                        │                          │
  │                        │ ── transfer(proof, ...) ─►│
  │                        │                          │ Verify proof
  │                        │                          │ Mark nullifier spent
  │                        │                          │ Create output note
  │                        │                          │ Create change note
  │                        │ ◄─── Transfer event ─────│
```

### 3. User Withdraws

```
User                              AnonPool
  │                                  │
  │ Generate ZK proof                │
  │ (proves note ownership)          │
  │                                  │
  │ ── withdraw(proof, ..., addr) ──►│
  │                                  │ Verify proof
  │                                  │ Mark nullifier spent
  │                                  │ Transfer tokens to addr
  │ ◄────── Withdrawal event ────────│
```

## Testing

The test suite includes **102 tests** across 2 test suites:

**AnonPool.t.sol** (59 tests):
- Constructor validation
- Spender management (add/remove)
- Deposit flows and edge cases
- Withdrawal flows and edge cases
- Transfer flows and edge cases
- Pausable functionality
- Merkle tree operations
- View function correctness

**AuctionSpender.t.sol** (43 tests):
- Slot timing and settlement windows
- One-settlement-per-slot enforcement
- Operator and owner access control
- Pause/unpause functionality
- Edge cases and error conditions

Run all tests:

```shell
bun run test
```

## Dependencies

- OpenZeppelin Contracts v5.x
  - `IERC20` / `SafeERC20`
  - `ReentrancyGuard`
  - `Ownable`
  - `Pausable`

## License

MIT
