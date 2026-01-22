# @anon/protocol

Protocol layer for AnonPool: Solidity smart contracts and Noir ZK circuits.

## Structure

```
packages/protocol/
├── contracts/           # Solidity smart contracts
│   ├── AnonPool.sol     # Main privacy pool contract
│   ├── AuctionSpender.sol
│   └── verifiers/       # Auto-generated ZK verifiers
├── circuits/            # Noir ZK circuits
│   ├── transfer/        # Transfer circuit
│   └── withdraw/        # Withdraw circuit
├── script/              # Deployment scripts
│   ├── Deploy.s.sol
│   ├── DeployLocal.s.sol
│   ├── deploy-testnet.sh
│   └── generate-verifiers.sh
└── test/                # Forge tests
```

## Contracts

| Contract | Description |
|----------|-------------|
| `AnonPool.sol` | Main privacy pool with deposits, withdrawals, and transfers |
| `AuctionSpender.sol` | Rate-limited spender for slot-based auctions |
| `verifiers/TransferVerifier.sol` | Auto-generated ZK verifier for transfers |
| `verifiers/WithdrawVerifier.sol` | Auto-generated ZK verifier for withdrawals |

## Circuits

| Circuit | Description |
|---------|-------------|
| `withdraw` | Proves ownership of a note for withdrawal |
| `transfer` | Proves ownership and creates output + change notes |

## Development

### Build Contracts

```shell
bun run build
```

### Build Circuits

```shell
bun run build:circuits
```

### Generate Verifiers

Regenerate Solidity verifiers from compiled circuits:

```shell
bun run generate:verifiers
```

### Test

```shell
# Solidity tests
bun run test

# Circuit tests
bun run test:circuits
```

### Deploy

```shell
# Local Anvil
bun run deploy:local

# Base Sepolia testnet
bun run deploy:testnet

# Base mainnet
bun run deploy:mainnet
```

## Architecture

### AnonPool.sol

Privacy-preserving token pool with:

- **Deposits**: Users deposit tokens and receive a commitment: `hash(hash(secret, nullifier), amount)`
- **Withdrawals**: Users prove ownership via ZK proof and withdraw to any address
- **Transfers**: Approved spenders execute transfers on behalf of users
- **Merkle Tree**: 20-level tree (2^20 = 1M+ capacity) tracks all commitments
- **Nullifiers**: Prevent double-spending by tracking spent note hashes

### Security Features

- ReentrancyGuard, Pausable, SafeERC20
- Fee-on-transfer token support
- Root history with proper invalidation
- Commitment collision prevention

## Contract Interface

### For Users

```solidity
// Deposit tokens
function deposit(bytes32 commitment, uint256 amount) external;

// Withdraw with ZK proof
function withdraw(
    bytes calldata proof,
    bytes32 nullifierHash,
    bytes32 root,
    uint256 amount,
    address recipient
) external;
```

### For Spenders

```solidity
// Transfer on behalf of user
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

## License

MIT
