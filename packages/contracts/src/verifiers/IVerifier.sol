// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWithdrawVerifier
/// @notice Interface for ZK withdraw proof verification
/// @dev Production verifiers should be generated from compiled Noir circuits using:
///      `nargo compile && bb write_vk && bb contract`
///
///      SECURITY REQUIREMENTS:
///      1. Verifier must be generated from the exact circuit deployed in production
///      2. Verifier must be immutable (no upgradeable proxies)
///      3. Verifier must correctly validate all public inputs match the proof
///      4. Verifier must revert or return false for invalid proofs (never true)
///
///      PUBLIC INPUTS ORDER (must match circuit):
///      - nullifierHash: Hash of the nullifier being spent
///      - root: The Merkle root being proven against
///      - amount: The amount being withdrawn (bound to commitment)
///      - recipient: The address receiving the withdrawal (bound to proof)
interface IWithdrawVerifier {
    /// @notice Verify a ZK proof for withdrawal
    /// @param proof The ZK proof bytes (format depends on proving system)
    /// @param nullifierHash Hash of the nullifier being spent
    /// @param root The Merkle root being proven against
    /// @param amount The amount being withdrawn
    /// @param recipient The address receiving the withdrawal
    /// @return True if the proof is valid, false otherwise
    function verify(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        uint256 amount,
        address recipient
    ) external view returns (bool);
}

/// @title ITransferVerifier
/// @notice Interface for ZK transfer proof verification
/// @dev Production verifiers should be generated from compiled Noir circuits using:
///      `nargo compile && bb write_vk && bb contract`
///
///      SECURITY REQUIREMENTS:
///      1. Verifier must be generated from the exact circuit deployed in production
///      2. Verifier must be immutable (no upgradeable proxies)
///      3. Circuit MUST enforce conservation law: inputAmount = outputAmount + changeAmount
///      4. Circuit MUST bind amounts to commitments
///      5. Verifier must revert or return false for invalid proofs (never true)
///
///      PUBLIC INPUTS ORDER (must match circuit):
///      - nullifierHash: Hash of the nullifier being spent
///      - root: The Merkle root being proven against
///      - outputCommitment: Commitment for the recipient's new note
///      - outputAmount: Amount in the output note
///      - changeCommitment: Commitment for the sender's change note
///      - changeAmount: Amount in the change note
interface ITransferVerifier {
    /// @notice Verify a ZK proof for transfer
    /// @param proof The ZK proof bytes (format depends on proving system)
    /// @param nullifierHash Hash of the nullifier being spent
    /// @param root The Merkle root being proven against
    /// @param outputCommitment Commitment for the recipient's new note
    /// @param outputAmount Amount in the output note
    /// @param changeCommitment Commitment for the sender's change note
    /// @param changeAmount Amount in the change note
    /// @return True if the proof is valid, false otherwise
    function verify(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        bytes32 outputCommitment,
        uint256 outputAmount,
        bytes32 changeCommitment,
        uint256 changeAmount
    ) external view returns (bool);
}
