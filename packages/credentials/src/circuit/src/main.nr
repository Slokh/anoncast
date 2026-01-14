use dep::lib::{ecrecover, proof};

/// Proves ownership of an ERC20 token balance without revealing the wallet address.
///
/// This circuit verifies:
/// 1. The signer owns a wallet (via ECDSA signature verification)
/// 2. That wallet has at least `verified_balance` tokens at the given block
///
/// Used specifically for $ANON token on Base chain.
fn main(
    // Address Data (proves wallet ownership)
    signature: [u8; 64],
    message_hash: [u8; 32],
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
    // Storage Proof (proves balance)
    // Array sizes tuned for ~108k holders (max depth 6, max node 1066 bytes)
    // Will need to increase if holder count exceeds ~1M
    storage_hash: [u8; 32],
    storage_nodes: [[u8; 1080]; 5],
    storage_leaf: [u8; 120],
    storage_depth: u32,
    storage_value: Field,
    // Verification Data
    chain_id: Field,
    block_number: Field,
    token_address: Field,
    balance_slot: Field,
    // Balance Data
    verified_balance: Field,
) -> pub (Field, Field, Field, Field, Field, [u8; 32]) {
    let balance_slot_bytes: [u8; 32] = balance_slot.to_be_bytes();
    let address: [u8; 32] =
        ecrecover::ecrecover(pub_key_x, pub_key_y, signature, message_hash).to_be_bytes();

    let key = proof::get_storage_key([address, balance_slot_bytes]);
    let value = proof::get_storage_value(storage_value);

    proof::verify(
        key,
        value,
        storage_hash,
        storage_nodes,
        storage_leaf,
        storage_depth,
    );

    // Ensure verified_balance <= actual balance (prevents over-claiming)
    assert(!storage_value.lt(verified_balance), "Attempt to verify too high balance");

    (verified_balance, chain_id, block_number, token_address, balance_slot, storage_hash)
}
