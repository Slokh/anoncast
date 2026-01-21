# End-to-End Testing Checklist

This document provides a comprehensive checklist for testing the AnonPool system end-to-end before deployment.

## Prerequisites

- [ ] Nargo v0.38.0+ installed (`nargo --version`)
- [ ] Barretenberg (`bb`) installed (`bb --version`)
- [ ] Foundry installed (`forge --version`)
- [ ] Bun installed (`bun --version`)
- [ ] Node.js 18+ installed
- [ ] Local environment variables configured

## 1. Circuit Tests

### Transfer Circuit
```bash
cd packages/pool/src/circuits/transfer
nargo test
```

**Expected**: 12 tests pass
- [ ] `test_basic_transfer` - Standard transfer with change
- [ ] `test_full_amount_transfer` - Transfer entire balance (no change)
- [ ] `test_minimum_amount` - Transfer 1 token
- [ ] `test_maximum_amount` - Transfer at MAX_AMOUNT boundary
- [ ] `test_merkle_path_verification` - Merkle proof validation
- [ ] `test_commitment_binding` - Commitment includes amount
- [ ] `test_invalid_merkle_root` (should fail) - Wrong root rejected
- [ ] `test_invalid_amount_sum` (should fail) - input != output + change
- [ ] `test_amount_overflow` (should fail) - Exceeds MAX_AMOUNT
- [ ] `test_nullifier_hash_computation` - Correct nullifier derivation
- [ ] `test_change_commitment_binding` - Change commitment includes amount
- [ ] `test_output_commitment_verification` - Output commitment validated

### Withdraw Circuit
```bash
cd packages/pool/src/circuits/withdraw
nargo test
```

**Expected**: 7 tests pass
- [ ] `test_basic_withdraw` - Standard withdrawal
- [ ] `test_full_withdraw` - Withdraw entire balance
- [ ] `test_partial_withdraw` - Withdraw less than balance
- [ ] `test_recipient_binding` - Recipient bound to proof
- [ ] `test_maximum_amount` - Withdraw at MAX_AMOUNT
- [ ] `test_invalid_merkle_root` (should fail) - Wrong root rejected
- [ ] `test_amount_overflow` (should fail) - Exceeds MAX_AMOUNT

## 2. Contract Tests

```bash
cd packages/contracts
bun run test
```

**Expected**: 102 tests pass (59 AnonPool + 43 AuctionSpender)

### AnonPool Tests
- [ ] Constructor validation (4 tests)
- [ ] Spender management (4 tests)
- [ ] Deposit flows (10 tests)
- [ ] Withdrawal flows (8 tests)
- [ ] Transfer flows (15 tests)
- [ ] Merkle tree operations (6 tests)
- [ ] Pausable functionality (4 tests)
- [ ] View functions (8 tests)

### AuctionSpender Tests
- [ ] Constructor validation (7 tests)
- [ ] Slot timing calculations (8 tests)
- [ ] Settlement window enforcement (6 tests)
- [ ] One-per-slot rate limiting (5 tests)
- [ ] Access control (8 tests)
- [ ] Pause/emergency functions (5 tests)
- [ ] View functions (4 tests)

## 3. TypeScript Tests

```bash
cd packages/pool
bun test
```

**Expected**: All TypeScript tests pass
- [ ] Hash function tests (keccak256 compatibility)
- [ ] Commitment computation tests
- [ ] Nullifier hash tests
- [ ] Merkle tree tests
- [ ] Note serialization/deserialization
- [ ] Privacy wallet derivation tests

## 4. Verifier Generation

```bash
cd packages/pool
bun run generate:verifiers
```

**Expected**:
- [ ] `packages/contracts/src/verifiers/TransferVerifier.sol` generated
- [ ] `packages/contracts/src/verifiers/WithdrawVerifier.sol` generated
- [ ] Both files have MIT license header
- [ ] Contract names are correct (not UltraVerifier)

## 5. Integration Testing (Local)

### Deploy to Local Anvil

```bash
# Terminal 1: Start Anvil
anvil

# Terminal 2: Deploy contracts
cd packages/contracts
forge script script/Deploy.s.sol:DeployTestnet \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```

**Expected**:
- [ ] TestANON token deployed
- [ ] AnonPool deployed with correct verifiers
- [ ] AuctionSpender deployed and added as spender
- [ ] All contract addresses logged

### Test Deposit Flow

1. **Mint test tokens**
   ```bash
   cast send <TOKEN_ADDRESS> "mint(address,uint256)" <YOUR_ADDRESS> 1000000000000000000000 \
     --rpc-url http://localhost:8545 \
     --private-key <PRIVATE_KEY>
   ```

2. **Approve pool**
   ```bash
   cast send <TOKEN_ADDRESS> "approve(address,uint256)" <POOL_ADDRESS> 1000000000000000000000 \
     --rpc-url http://localhost:8545 \
     --private-key <PRIVATE_KEY>
   ```

3. **Generate commitment** (via TypeScript)
   ```typescript
   import { generateNote, computeCommitment } from '@anon/pool'
   const note = generateNote(100n * 10n ** 18n)
   console.log('Commitment:', '0x' + note.commitment.toString(16).padStart(64, '0'))
   ```

4. **Deposit**
   ```bash
   cast send <POOL_ADDRESS> "deposit(bytes32,uint256)" <COMMITMENT> 100000000000000000000 \
     --rpc-url http://localhost:8545 \
     --private-key <PRIVATE_KEY>
   ```

**Verification Checklist**:
- [ ] Deposit event emitted with correct commitment
- [ ] Token balance decreased
- [ ] Pool balance increased
- [ ] Merkle root changed
- [ ] Leaf count incremented

### Test Withdraw Flow

1. **Get merkle proof** (from indexer or compute locally)
2. **Generate ZK proof** (via TypeScript with circuit artifacts)
3. **Submit withdrawal**

**Verification Checklist**:
- [ ] Withdrawal event emitted
- [ ] Nullifier marked as spent
- [ ] Tokens transferred to recipient
- [ ] Cannot double-spend same nullifier

### Test Transfer Flow (via AuctionSpender)

1. **Generate transfer proof**
2. **Wait for settlement window**
3. **Operator calls settle()**

**Verification Checklist**:
- [ ] Transfer event emitted
- [ ] Output note created
- [ ] Change note created (if applicable)
- [ ] Nullifier marked as spent
- [ ] Slot marked as settled
- [ ] Cannot settle same slot twice

## 6. Frontend Testing

```bash
cd apps/web
bun run dev
```

### Manual Test Checklist

**Wallet Connection**:
- [ ] RainbowKit wallet selection works
- [ ] Connected address displayed
- [ ] Network detection correct

**Privacy Wallet**:
- [ ] Sign message to initialize wallet
- [ ] Wallet state persists in localStorage
- [ ] Balance displays correctly
- [ ] Notes list populated after sync

**Deposit UI**:
- [ ] Amount input validation
- [ ] Token approval flow works
- [ ] Deposit transaction submits
- [ ] Pending state shown
- [ ] Confirmation detected

**Proof Freshness Warnings**:
- [ ] Warning appears for old proofs
- [ ] Correct status (warning/urgent/critical/expired)
- [ ] Regenerate button works

**Auction UI**:
- [ ] Current slot timer displays
- [ ] Bid submission works
- [ ] Auction history loads

## 7. Cross-Component Verification

### Hash Function Compatibility

Verify the same inputs produce the same hash across all components:

**Test values**:
- Input: `secret = 12345, nullifier = 67890, amount = 100`
- Expected: Same commitment in Noir, TypeScript, and Solidity

- [ ] Noir circuit produces correct commitment
- [ ] TypeScript `computeCommitment()` matches
- [ ] Solidity keccak256 matches (if verification needed)

### Merkle Tree Compatibility

- [ ] TypeScript MerkleTree produces same root as on-chain
- [ ] Merkle proofs generated client-side verify on-chain
- [ ] Zero values match across implementations

### Nullifier Compatibility

- [ ] Nullifier hash computed same way everywhere
- [ ] Spent nullifier detected correctly
- [ ] Batch nullifier check works

## 8. Security Verification

### Rate Limiting
- [ ] Cannot settle same slot twice
- [ ] Cannot settle before window opens
- [ ] Cannot settle after window closes
- [ ] Cannot settle future slots

### Access Control
- [ ] Only owner can add/remove spenders
- [ ] Only operator can call settle()
- [ ] Only owner can pause/unpause
- [ ] Emergency withdraw only to owner

### Proof Verification
- [ ] Invalid proofs rejected
- [ ] Old merkle roots (beyond 1000) rejected
- [ ] Double-spend attempts rejected
- [ ] Amount manipulation detected

### Edge Cases
- [ ] Zero amount transfers rejected
- [ ] Zero address recipients rejected
- [ ] Duplicate commitments rejected
- [ ] Paused state blocks all operations
- [ ] Overflow protection works

## 9. Testnet Deployment Checklist

### Pre-Deployment
- [ ] All local tests pass
- [ ] Verifiers regenerated from latest circuits
- [ ] Contract addresses documented
- [ ] Environment variables set

### Deployment Steps
```bash
cd packages/contracts

# Set environment variables
export BASE_SEPOLIA_RPC_URL=...
export PRIVATE_KEY=...
export BASESCAN_API_KEY=...

# Deploy
bun run deploy:testnet
```

### Post-Deployment Verification
- [ ] Contracts verified on BaseScan
- [ ] Token contract functional
- [ ] Pool accepts deposits
- [ ] Withdrawals work with valid proofs
- [ ] AuctionSpender added as spender
- [ ] Settlement works in correct time windows

## 10. Monitoring Setup

- [ ] Event indexer running
- [ ] Deposit events tracked
- [ ] Transfer events tracked
- [ ] Withdrawal events tracked
- [ ] Error alerting configured

## Troubleshooting

### Common Issues

**"Invalid proof" on withdrawal**:
- Check merkle root is still valid (< 1000 deposits ago)
- Verify commitment includes amount in hash
- Ensure nullifier hasn't been spent

**"SlotAlreadySettled" error**:
- Slot was already settled - check slotSettled mapping
- Use canSettle() to check status before calling

**"SlotNotYetSettleable" error**:
- Wait for settlement window to open
- Check getSettlementWindow() for timing

**Verifier compilation fails**:
- Use `bun run build` (skips verifiers) for dev
- Use `bun run build:all` with verifiers profile for production

**Hash mismatch between components**:
- Ensure values are padded to 32 bytes
- Verify field reduction (mod BN254 prime)
- Check endianness consistency

## Sign-Off

| Component | Tested By | Date | Notes |
|-----------|-----------|------|-------|
| Transfer Circuit | | | |
| Withdraw Circuit | | | |
| AnonPool Contract | | | |
| AuctionSpender Contract | | | |
| TypeScript Utils | | | |
| Frontend | | | |
| Integration | | | |
| Testnet Deploy | | | |
