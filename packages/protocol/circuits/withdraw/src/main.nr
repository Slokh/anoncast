use dep::std::hash::keccak256;

/// Merkle tree depth for the privacy pool
global MERKLE_DEPTH: u32 = 20;

/// Maximum amount to prevent field overflow in arithmetic operations.
/// Set to 2^128 - 1, which is more than sufficient for any token supply.
global MAX_AMOUNT: Field = 340282366920938463463374607431768211455; // 2^128 - 1

/// Proves knowledge of a note for withdrawal.
/// Used to withdraw funds to a wallet address.
///
/// This circuit verifies:
/// 1. The prover knows (secret, nullifier, amount) that hash to a valid commitment
/// 2. That commitment exists in the merkle tree
/// 3. The withdraw amount matches the note's committed amount
/// 4. The recipient is bound to the proof (prevents front-running)
fn main(
    // Private inputs
    secret: Field,
    nullifier: Field,
    amount: Field,

    // Merkle proof
    merkle_path: [Field; MERKLE_DEPTH],
    merkle_indices: [u1; MERKLE_DEPTH],

    // Public inputs - these are verified by the on-chain verifier
    nullifier_hash: pub Field,
    merkle_root: pub Field,
    withdraw_amount: pub Field,
    recipient: pub Field,
) {
    // 1. Bounds check on amount
    assert(field_lte(amount, MAX_AMOUNT), "Amount exceeds maximum");

    // 2. Verify withdraw_amount is positive
    assert(withdraw_amount as u64 > 0, "Withdraw amount must be positive");

    // 3. Verify note is in tree (amount is bound to commitment)
    let commitment = compute_commitment(secret, nullifier, amount);
    let computed_root = compute_merkle_root(commitment, merkle_path, merkle_indices);
    assert(computed_root == merkle_root, "Invalid merkle proof");

    // 4. Verify nullifier hash
    let computed_nullifier_hash = hash_field(nullifier);
    assert(computed_nullifier_hash == nullifier_hash, "Invalid nullifier hash");

    // 5. Verify amount matches the public withdraw_amount
    // Since amount is bound to the commitment (verified via merkle proof),
    // this constraint ensures the prover can only withdraw the actual deposited amount.
    assert(amount == withdraw_amount, "Amount mismatch");

    // 6. Bind recipient to the proof by including it in a hash computation.
    // This ensures any change to recipient after proof generation will cause
    // verification to fail, preventing front-running attacks.
    let recipient_binding = hash_field(recipient);
    assert(recipient_binding != 0, "Invalid recipient");
}

// ============ Helper Functions ============

/// Compute commitment = hash(hash(secret, nullifier), amount)
/// The amount MUST be included in the commitment to bind the note's value.
fn compute_commitment(secret: Field, nullifier: Field, amount: Field) -> Field {
    let inner = hash_two_fields(secret, nullifier);
    hash_two_fields(inner, amount)
}

/// Compute merkle root from leaf and path
fn compute_merkle_root(
    leaf: Field,
    path: [Field; MERKLE_DEPTH],
    indices: [u1; MERKLE_DEPTH],
) -> Field {
    let mut current = leaf;

    for i in 0..MERKLE_DEPTH {
        let sibling = path[i];
        if indices[i] == 0 {
            current = hash_two_fields(current, sibling);
        } else {
            current = hash_two_fields(sibling, current);
        }
    }

    current
}

/// Hash a single field element
fn hash_field(value: Field) -> Field {
    let bytes: [u8; 32] = value.to_be_bytes();
    let hash = keccak256(bytes, 32);
    bytes_to_field(hash)
}

/// Hash two field elements together
fn hash_two_fields(left: Field, right: Field) -> Field {
    let left_bytes: [u8; 32] = left.to_be_bytes();
    let right_bytes: [u8; 32] = right.to_be_bytes();

    let mut combined: [u8; 64] = [0; 64];
    for i in 0..32 {
        combined[i] = left_bytes[i];
        combined[i + 32] = right_bytes[i];
    }

    let hash = keccak256(combined, 64);
    bytes_to_field(hash)
}

/// Convert 32 bytes to a field element
fn bytes_to_field(bytes: [u8; 32]) -> Field {
    let mut result: Field = 0;
    for i in 0..32 {
        result = result * 256 + bytes[i] as Field;
    }
    result
}

/// Check if a field element is less than or equal to another
fn field_lte(a: Field, b: Field) -> bool {
    a.lt(b + 1)
}

// ============ Tests ============

#[test]
fn test_hash_field_deterministic() {
    let value: Field = 12345;
    let hash1 = hash_field(value);
    let hash2 = hash_field(value);
    assert(hash1 == hash2, "Hash should be deterministic");
}

#[test]
fn test_hash_two_fields_deterministic() {
    let left: Field = 100;
    let right: Field = 200;
    let hash1 = hash_two_fields(left, right);
    let hash2 = hash_two_fields(left, right);
    assert(hash1 == hash2, "Hash should be deterministic");
}

#[test]
fn test_compute_commitment_includes_amount() {
    let secret: Field = 111;
    let nullifier: Field = 222;
    let amount1: Field = 1000;
    let amount2: Field = 2000;

    let commitment1 = compute_commitment(secret, nullifier, amount1);
    let commitment2 = compute_commitment(secret, nullifier, amount2);

    assert(commitment1 != commitment2, "Different amounts should produce different commitments");
}

#[test]
fn test_merkle_root_deterministic() {
    let leaf: Field = 12345;
    let path: [Field; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    let indices: [u1; MERKLE_DEPTH] = [0; MERKLE_DEPTH];

    let root1 = compute_merkle_root(leaf, path, indices);
    let root2 = compute_merkle_root(leaf, path, indices);

    assert(root1 == root2, "Merkle root should be deterministic");
}

#[test]
fn test_merkle_root_different_leaves() {
    let path: [Field; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    let indices: [u1; MERKLE_DEPTH] = [0; MERKLE_DEPTH];

    let root1 = compute_merkle_root(111, path, indices);
    let root2 = compute_merkle_root(222, path, indices);

    assert(root1 != root2, "Different leaves should produce different roots");
}

#[test]
fn test_field_lte() {
    assert(field_lte(5, 10), "5 <= 10");
    assert(field_lte(10, 10), "10 <= 10");
    assert(!field_lte(11, 10), "11 > 10");
}

#[test]
fn test_recipient_binding_nonzero() {
    // Any valid address should produce a non-zero hash
    let recipient: Field = 0x1234567890abcdef1234567890abcdef12345678;
    let binding = hash_field(recipient);
    assert(binding != 0, "Recipient binding should be non-zero");
}
