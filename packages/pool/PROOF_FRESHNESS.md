# Proof Freshness & Root Expiration

## Overview

AnonPool maintains a history of the last **1,000 Merkle roots**. Proofs must reference a root that exists in this history to be valid. This document explains why this matters and how to handle it.

## Why Root Expiration Exists

### Privacy Protection

Root expiration is a **privacy feature**, not a limitation. Here's why:

1. **Without expiration**: Users could create proofs against very old roots, reducing their anonymity set to only the deposits that existed at that time.

2. **With expiration**: Users must use recent roots, which means their anonymity set includes all recent deposits, providing stronger privacy.

### Example

If you deposited when there were only 10 deposits in the pool, and you create a proof against that old root, observers know you're one of those 10 depositors. By forcing you to use a recent root (with 1000+ deposits), your anonymity set is much larger.

## How It Works

```
Deposit 1    → Root A (stored at index 0)
Deposit 2    → Root B (stored at index 1)
...
Deposit 1000 → Root Z (stored at index 999)
Deposit 1001 → Root AA (stored at index 0, Root A is now INVALID)
```

When the 1001st deposit occurs, Root A is overwritten and becomes invalid. Any proof referencing Root A will be rejected.

## Checking Proof Freshness

### On-Chain: `getRootStatus()`

```solidity
function getRootStatus(bytes32 root) external view returns (
    bool exists,           // Is the root currently valid?
    uint32 depositsAgo,    // How many deposits since this root?
    uint32 depositsUntilExpiry  // How many more deposits until expiry?
);
```

### Example Usage

```typescript
const [exists, depositsAgo, depositsUntilExpiry] = await pool.getRootStatus(proofRoot);

if (!exists) {
  // Root has expired - regenerate proof with current root
  throw new Error('Proof expired - please regenerate');
}

if (depositsUntilExpiry < 50) {
  // Warning: proof will expire soon
  console.warn(`Proof expires in ${depositsUntilExpiry} deposits`);
}
```

## User Guidelines

### When Creating Proofs

1. **Always use the latest root** when generating new proofs
2. **Check freshness** before submitting transactions
3. **Regenerate if needed** - if your proof is old, get the current root and create a new proof

### Warning Thresholds

| Deposits Until Expiry | Status | Action |
|-----------------------|--------|--------|
| > 100 | ✅ Safe | Proceed normally |
| 50-100 | ⚠️ Warning | Consider regenerating soon |
| 10-50 | ⚠️ Urgent | Regenerate before submitting |
| < 10 | 🔴 Critical | Must regenerate immediately |
| 0 | ❌ Expired | Proof is invalid |

### High-Volume Periods

During high-volume periods (many deposits per hour), proofs expire faster. The frontend should:

1. Check root status before any transaction
2. Display warnings when proofs are aging
3. Automatically prompt for regeneration when needed

## Technical Details

### Constants

```solidity
uint32 public constant ROOT_HISTORY_SIZE = 1000;
```

### Root Storage

Roots are stored in a circular buffer:

```solidity
mapping(uint256 => bytes32) public roots;      // index → root
mapping(bytes32 => bool) public rootExists;    // root → valid?
uint32 public currentRootIndex;                // current position in buffer
```

### Invalidation Process

When a new root is inserted:

1. Calculate new index: `(currentRootIndex + 1) % 1000`
2. Mark old root at that index as invalid: `rootExists[oldRoot] = false`
3. Store new root: `roots[newIndex] = newRoot`
4. Mark new root valid: `rootExists[newRoot] = true`

## FAQ

### Q: Can I increase ROOT_HISTORY_SIZE?

The constant is set at deploy time and cannot be changed. To increase it, a new pool contract would need to be deployed.

### Q: What if I'm in the middle of a transaction and my proof expires?

The transaction will revert with `InvalidMerkleRoot()`. You'll need to regenerate the proof and resubmit. Gas spent on the failed transaction is not recoverable.

### Q: How often should I check freshness?

- **Before generating a proof**: Always use latest root
- **Before submitting a transaction**: Check `depositsUntilExpiry > 10`
- **For pending transactions**: Monitor if there's a delay in confirmation

### Q: Does this affect privacy?

Root expiration **enhances** privacy by ensuring users always prove against recent roots with large anonymity sets.
