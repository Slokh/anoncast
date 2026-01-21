# ZK Verifier Contracts

## Overview

The AnonPool system requires two ZK verifier contracts:

1. **WithdrawVerifier** - Verifies proofs for withdrawals
2. **TransferVerifier** - Verifies proofs for transfers

## Generating Production Verifiers

Verifiers are generated from compiled Noir circuits. The process:

```bash
# 1. Compile the circuits
cd packages/pool/src/circuits/transfer
nargo compile

cd ../withdraw
nargo compile

# 2. Generate verification keys
bb write_vk -b target/anon_transfer.json -o target/vkey
bb write_vk -b target/anon_withdraw.json -o target/vkey

# 3. Generate Solidity verifier contracts
bb contract -k target/vkey -o ../../contracts/src/verifiers/TransferVerifier.sol
bb contract -k target/vkey -o ../../contracts/src/verifiers/WithdrawVerifier.sol
```

## Security Requirements

### Circuit-Verifier Binding

⚠️ **CRITICAL**: The verifier MUST be generated from the exact circuit that will be used in production.

- Any mismatch between circuit and verifier will either:
  - Reject all valid proofs (denial of service)
  - Accept invalid proofs (security breach)

### Pre-Deployment Checklist

- [ ] Verifier generated from audited circuit code
- [ ] Circuit enforces all security properties:
  - [ ] Commitment binds (secret, nullifier, amount)
  - [ ] Conservation law: output + change = input
  - [ ] Amount bounds check (≤ 2^128 - 1)
  - [ ] Recipient bound to proof (withdraw only)
- [ ] Verifier contract has no external dependencies
- [ ] Verifier contract is not upgradeable
- [ ] Gas cost tested for worst-case proofs
- [ ] Fuzz testing with invalid proofs confirms rejection

### Verifier Interface

Verifiers must implement the exact interfaces defined in `IVerifier.sol`:

```solidity
// Withdraw verifier
function verify(
    bytes calldata proof,
    bytes32 nullifierHash,
    bytes32 root,
    uint256 amount,
    address recipient
) external view returns (bool);

// Transfer verifier
function verify(
    bytes calldata proof,
    bytes32 nullifierHash,
    bytes32 root,
    bytes32 outputCommitment,
    uint256 outputAmount,
    bytes32 changeCommitment,
    uint256 changeAmount
) external view returns (bool);
```

## Public Input Ordering

The order of public inputs in the verifier MUST match the circuit's public input order.

### Withdraw Circuit Public Inputs
1. `nullifier_hash` - bytes32
2. `merkle_root` - bytes32
3. `withdraw_amount` - uint256
4. `recipient` - address (as Field, cast to address)

### Transfer Circuit Public Inputs
1. `nullifier_hash` - bytes32
2. `merkle_root` - bytes32
3. `output_amount` - uint256
4. `change_commitment` - bytes32
5. `change_amount` - uint256
6. `output_commitment` - bytes32

## Testing

The test suite uses mock verifiers that always return `true`. These are located in `test/AnonPool.t.sol` and should **NEVER** be used in production.

```solidity
// ⚠️ TEST ONLY - DO NOT DEPLOY
contract TestWithdrawVerifier {
    function verify(...) external pure returns (bool) {
        return true;  // UNSAFE: Accepts any proof
    }
}
```

For integration testing with real proofs, use the generated verifiers with test proofs created from the Noir prover.
