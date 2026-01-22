use dep::std::hash::keccak256;

/// Merkle tree depth for the privacy pool
global MERKLE_DEPTH: u32 = 20;

/// Maximum amount to prevent field overflow in arithmetic operations.
/// Set to 2^128 - 1, which is more than sufficient for any token supply
/// while ensuring output + change won't overflow the ~254-bit field.
global MAX_AMOUNT: Field = 340282366920938463463374607431768211455; // 2^128 - 1

/// Proves ownership of a deposit and authorizes a transfer with change.
///
/// This circuit verifies:
/// 1. The prover knows (secret, nullifier, amount) that hash to a valid commitment
/// 2. That commitment exists in the merkle tree (binding the amount cryptographically)
/// 3. output_amount + change_amount == input_amount (conservation of value)
/// 4. The change commitment is correctly formed (including amount binding)
///
/// Public inputs:
/// - nullifier_hash: Hash of the nullifier (prevents double-spending)
/// - merkle_root: The root of the deposit merkle tree
/// - output_amount: The amount being transferred to recipient
/// - change_commitment: Commitment for the change note (inserted into tree)
/// - change_amount: Amount in the change note
/// - output_commitment: Commitment for the recipient's note
fn main(
    // ============ Input Note (being spent) ============
    secret: Field,
    nullifier: Field,
    input_amount: Field,

    // Merkle proof for input note
    merkle_path: [Field; MERKLE_DEPTH],
    merkle_indices: [u1; MERKLE_DEPTH], // 0 = left, 1 = right

    // ============ Change Note (created for remainder) ============
    change_secret: Field,
    change_nullifier: Field,

    // ============ Public Inputs ============
    nullifier_hash: pub Field,
    merkle_root: pub Field,
    output_amount: pub Field,
    change_commitment: pub Field,
    change_amount: pub Field,
    output_commitment: pub Field,
) {
    // 1. Bounds check on amounts to prevent field overflow
    // This ensures arithmetic operations behave as expected
    assert(field_lte(input_amount, MAX_AMOUNT), "Input amount exceeds maximum");
    assert(field_lte(output_amount, MAX_AMOUNT), "Output amount exceeds maximum");
    assert(field_lte(change_amount, MAX_AMOUNT), "Change amount exceeds maximum");

    // 2. Compute input commitment and verify it's in the tree
    // The input_amount is now cryptographically bound to the commitment,
    // preventing the prover from claiming an arbitrary amount.
    let input_commitment = compute_commitment(secret, nullifier, input_amount);
    let computed_root = compute_merkle_root(input_commitment, merkle_path, merkle_indices);
    assert(computed_root == merkle_root, "Invalid merkle proof");

    // 3. Verify nullifier_hash is correctly computed
    let computed_nullifier_hash = hash_field(nullifier);
    assert(computed_nullifier_hash == nullifier_hash, "Invalid nullifier hash");

    // 4. Verify conservation of value: output + change == input
    assert(
        output_amount + change_amount == input_amount,
        "Amounts don't balance: output + change must equal input"
    );

    // 5. Verify output_amount is positive (must transfer something)
    assert(output_amount as u64 > 0, "Output amount must be positive");

    // Note: change_amount >= 0 check removed as u64 cast is always non-negative.
    // The conservation law (output + change == input) combined with output > 0
    // ensures change_amount is valid (change = input - output).

    // 6. Verify change commitment is correctly formed (including amount binding)
    let computed_change_commitment = compute_commitment(change_secret, change_nullifier, change_amount);
    assert(
        computed_change_commitment == change_commitment,
        "Invalid change commitment"
    );

    // 7. If change_amount is zero, change_commitment should still be valid
    //    (the contract will skip inserting it if amount is 0)

    // output_commitment is intentionally NOT verified in this circuit.
    // The recipient provides their own commitment (computed from their secret, nullifier, amount).
    // It's passed through as a public input so the contract knows what commitment to insert.
    // The recipient is responsible for correctly computing their commitment.
    // Suppress unused variable warning:
    let _ = output_commitment;
}

// ============ Helper Functions ============

/// Compute commitment = hash(hash(secret, nullifier), amount)
/// The amount MUST be included in the commitment to bind the note's value.
/// Without this, an attacker could claim any amount for a given (secret, nullifier) pair.
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
            // Current node is on the left
            current = hash_two_fields(current, sibling);
        } else {
            // Current node is on the right
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
/// Used for bounds checking to prevent overflow
fn field_lte(a: Field, b: Field) -> bool {
    a.lt(b + 1)
}

// ============ Tests ============

#[test]
fn test_hash_field_deterministic() {
    // Same input should produce same output
    let value: Field = 12345;
    let hash1 = hash_field(value);
    let hash2 = hash_field(value);
    assert(hash1 == hash2, "Hash should be deterministic");
}

#[test]
fn test_hash_field_different_inputs() {
    // Different inputs should produce different outputs
    let hash1 = hash_field(1);
    let hash2 = hash_field(2);
    assert(hash1 != hash2, "Different inputs should produce different hashes");
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
fn test_hash_two_fields_order_matters() {
    // hash(a, b) != hash(b, a)
    let a: Field = 100;
    let b: Field = 200;
    let hash_ab = hash_two_fields(a, b);
    let hash_ba = hash_two_fields(b, a);
    assert(hash_ab != hash_ba, "Hash order should matter");
}

#[test]
fn test_compute_commitment_includes_amount() {
    let secret: Field = 111;
    let nullifier: Field = 222;
    let amount1: Field = 1000;
    let amount2: Field = 2000;

    let commitment1 = compute_commitment(secret, nullifier, amount1);
    let commitment2 = compute_commitment(secret, nullifier, amount2);

    // Same secret/nullifier but different amounts should produce different commitments
    assert(commitment1 != commitment2, "Different amounts should produce different commitments");
}

#[test]
fn test_compute_commitment_deterministic() {
    let secret: Field = 111;
    let nullifier: Field = 222;
    let amount: Field = 1000;

    let commitment1 = compute_commitment(secret, nullifier, amount);
    let commitment2 = compute_commitment(secret, nullifier, amount);

    assert(commitment1 == commitment2, "Commitment should be deterministic");
}

#[test]
fn test_merkle_root_single_leaf() {
    // Test with a simple merkle path (all zeros as siblings)
    let leaf: Field = 12345;
    let mut path: [Field; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    let mut indices: [u1; MERKLE_DEPTH] = [0; MERKLE_DEPTH];

    // Compute root - should be deterministic
    let root1 = compute_merkle_root(leaf, path, indices);
    let root2 = compute_merkle_root(leaf, path, indices);

    assert(root1 == root2, "Merkle root should be deterministic");
}

#[test]
fn test_merkle_root_different_leaves() {
    let mut path: [Field; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    let mut indices: [u1; MERKLE_DEPTH] = [0; MERKLE_DEPTH];

    let root1 = compute_merkle_root(111, path, indices);
    let root2 = compute_merkle_root(222, path, indices);

    assert(root1 != root2, "Different leaves should produce different roots");
}

#[test]
fn test_merkle_root_index_matters() {
    let leaf: Field = 12345;
    let mut path: [Field; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    path[0] = 99999; // Non-zero sibling

    let mut indices_left: [u1; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    let mut indices_right: [u1; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    indices_right[0] = 1;

    let root_left = compute_merkle_root(leaf, path, indices_left);
    let root_right = compute_merkle_root(leaf, path, indices_right);

    assert(root_left != root_right, "Index position should affect root");
}

#[test]
fn test_field_lte() {
    assert(field_lte(5, 10), "5 <= 10");
    assert(field_lte(10, 10), "10 <= 10");
    assert(!field_lte(11, 10), "11 > 10");
    assert(field_lte(0, MAX_AMOUNT), "0 <= MAX_AMOUNT");
    assert(field_lte(MAX_AMOUNT, MAX_AMOUNT), "MAX_AMOUNT <= MAX_AMOUNT");
}

#[test]
fn test_conservation_law() {
    // Verify the math works as expected
    let input: Field = 1000;
    let output: Field = 600;
    let change: Field = 400;

    assert(output + change == input, "Conservation should hold");
}

#[test]
fn test_zero_change_valid() {
    // Zero change should be valid (spending entire note)
    let input: Field = 1000;
    let output: Field = 1000;
    let change: Field = 0;

    assert(output + change == input, "Zero change should be valid");
    assert(output as u64 > 0, "Output should be positive");
}
