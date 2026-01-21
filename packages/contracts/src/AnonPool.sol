// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title IWithdrawVerifier
/// @notice Interface for ZK withdraw proof verification
/// @dev Verifier must implement this exact signature for type-safe calls
interface IWithdrawVerifier {
    /// @notice Verify a ZK proof for withdrawal
    /// @param proof The ZK proof bytes
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
/// @dev Verifier must implement this exact signature for type-safe calls.
///      The ZK circuit MUST enforce: inputAmount = outputAmount + changeAmount
interface ITransferVerifier {
    /// @notice Verify a ZK proof for transfer
    /// @param proof The ZK proof bytes
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

/// @title AnonPool
/// @notice Privacy-preserving token pool with operator-controlled transfers
/// @dev Users deposit and can withdraw. Only approved spenders can initiate transfers
///      on behalf of users. This prevents mixing while allowing server-mediated
///      transfers for specific use cases (e.g., payments, subscriptions, tipping).
contract AnonPool is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint256 public constant MERKLE_TREE_LEVELS = 20;
    uint32 public constant MAX_LEAVES = 1_048_576; // 2^20
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    bytes32 public constant ZERO_VALUE = bytes32(uint256(keccak256("anon_pool")) % FIELD_SIZE);

    // Precomputed zero values for each level (gas optimization)
    bytes32[20] internal ZEROS;

    // ============ Immutables ============

    IERC20 public immutable token;

    /// @notice ZK verifier for withdraw proofs (immutable for security)
    IWithdrawVerifier public immutable withdrawVerifier;

    /// @notice ZK verifier for transfer proofs (immutable for security)
    ITransferVerifier public immutable transferVerifier;

    // ============ State ============

    mapping(address => bool) public approvedSpenders;

    // ============ Merkle Tree State ============

    uint32 public nextLeafIndex;
    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(uint256 => bytes32) public roots;
    mapping(bytes32 => bool) public rootExists;  // O(1) root lookup
    uint32 public currentRootIndex;
    uint32 public constant ROOT_HISTORY_SIZE = 1000;

    // ============ Commitment Tracking ============

    mapping(bytes32 => uint32) public commitmentIndex;  // commitment -> leaf index (0 means not found, indices are 1-based internally)

    // ============ Nullifier Tracking ============

    mapping(bytes32 => bool) public nullifierSpent;

    // ============ Note Tracking ============

    /// @dev Internal to preserve privacy - amounts are verified via ZK proofs
    mapping(bytes32 => uint256) internal noteAmounts;

    // ============ Events ============

    event Deposit(
        bytes32 indexed commitment,
        uint256 amount,
        uint32 leafIndex,
        uint256 timestamp
    );

    event Withdrawal(
        bytes32 indexed nullifierHash,
        address indexed recipient,
        uint256 amount
    );

    event Transfer(
        bytes32 indexed nullifierHash,
        bytes32 indexed outputCommitment,
        uint256 outputAmount,
        bytes32 indexed changeCommitment,
        uint256 changeAmount
    );

    event LeafInserted(
        bytes32 indexed commitment,
        uint32 leafIndex,
        bytes32 newRoot
    );

    event SpenderAdded(address indexed spender);
    event SpenderRemoved(address indexed spender);

    // ============ Errors ============

    error InvalidProof();
    error NullifierAlreadySpent();
    error InvalidMerkleRoot();
    error TreeFull();
    error InvalidCommitment();
    error CommitmentAlreadyExists();
    error InvalidAmount();
    error OnlyApprovedSpender();
    error SpenderAlreadyApproved();
    error SpenderNotApproved();
    error ZeroAddress();
    error LevelOutOfBounds();
    error InvalidVerifier();

    // ============ Modifiers ============

    modifier onlyApprovedSpender() {
        if (!approvedSpenders[msg.sender]) revert OnlyApprovedSpender();
        _;
    }

    // ============ Constructor ============

    constructor(
        address _token,
        address _withdrawVerifier,
        address _transferVerifier
    ) Ownable(msg.sender) {
        if (_token == address(0)) revert ZeroAddress();
        if (_withdrawVerifier == address(0)) revert ZeroAddress();
        if (_transferVerifier == address(0)) revert ZeroAddress();

        // Verify that verifier addresses contain code (not EOAs)
        // This catches deployment errors where wrong addresses are passed
        if (_withdrawVerifier.code.length == 0) revert InvalidVerifier();
        if (_transferVerifier.code.length == 0) revert InvalidVerifier();

        token = IERC20(_token);

        // Cast to typed interfaces - provides compile-time signature checking
        // If verifiers don't implement the exact interface, calls will revert
        withdrawVerifier = IWithdrawVerifier(_withdrawVerifier);
        transferVerifier = ITransferVerifier(_transferVerifier);

        // Precompute zero values for gas efficiency
        ZEROS[0] = ZERO_VALUE;
        for (uint256 i = 1; i < MERKLE_TREE_LEVELS; i++) {
            ZEROS[i] = bytes32(uint256(keccak256(abi.encodePacked(ZEROS[i - 1], ZEROS[i - 1]))) % FIELD_SIZE);
        }

        // Initialize merkle tree with zero values
        for (uint32 i = 0; i < MERKLE_TREE_LEVELS; i++) {
            filledSubtrees[i] = ZEROS[i];
        }
        bytes32 initialRoot = _computeZeroAtLevel(MERKLE_TREE_LEVELS);
        roots[0] = initialRoot;
        rootExists[initialRoot] = true;
    }

    /// @dev Compute zero value at level (only used in constructor for root)
    function _computeZeroAtLevel(uint256 level) internal view returns (bytes32) {
        if (level < MERKLE_TREE_LEVELS) return ZEROS[level];
        // For level 20 (root of empty tree)
        bytes32 current = ZEROS[MERKLE_TREE_LEVELS - 1];
        return bytes32(uint256(keccak256(abi.encodePacked(current, current))) % FIELD_SIZE);
    }

    // ============ Admin ============

    /// @notice Add an approved spender contract
    /// @param spender Address of the spender contract to approve
    function addSpender(address spender) external onlyOwner {
        if (spender == address(0)) revert ZeroAddress();
        if (approvedSpenders[spender]) revert SpenderAlreadyApproved();
        approvedSpenders[spender] = true;
        emit SpenderAdded(spender);
    }

    /// @notice Remove an approved spender contract
    /// @param spender Address of the spender contract to remove
    function removeSpender(address spender) external onlyOwner {
        if (!approvedSpenders[spender]) revert SpenderNotApproved();
        approvedSpenders[spender] = false;
        emit SpenderRemoved(spender);
    }

    /// @notice Pause all deposits, withdrawals, and transfers
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause all operations
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Deposit ============

    /// @notice Deposit tokens into the privacy pool
    /// @param commitment Hash of (secret, nullifier, amount) - only the depositor knows the preimage
    /// @param amount Amount of tokens to deposit
    function deposit(bytes32 commitment, uint256 amount) external nonReentrant whenNotPaused {
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (noteAmounts[commitment] != 0) revert CommitmentAlreadyExists();
        if (amount == 0) revert InvalidAmount();
        if (nextLeafIndex >= MAX_LEAVES) revert TreeFull();

        // Transfer tokens from depositor (handles fee-on-transfer tokens)
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;

        // Reject zero-amount deposits (prevents duplicate commitment attack with 100% fee tokens)
        if (received == 0) revert InvalidAmount();

        // Store actual received amount (protects against fee-on-transfer)
        noteAmounts[commitment] = received;

        // Insert commitment into merkle tree
        uint32 leafIndex = _insertLeaf(commitment);

        // Store commitment index (1-based to distinguish from "not found")
        commitmentIndex[commitment] = leafIndex + 1;

        emit Deposit(commitment, received, leafIndex, block.timestamp);
    }

    // ============ Withdrawal (user-initiated) ============

    /// @notice Withdraw tokens from the pool (user calls directly)
    /// @param proof ZK proof of valid note ownership
    /// @param nullifierHash Hash of the nullifier being spent
    /// @param root The merkle root being proven against
    /// @param amount The note amount to withdraw
    /// @param recipient Address to receive the tokens
    function withdraw(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        uint256 amount,
        address recipient
    ) external nonReentrant whenNotPaused {
        if (recipient == address(0)) revert ZeroAddress();
        if (nullifierSpent[nullifierHash]) revert NullifierAlreadySpent();
        if (!isKnownRoot(root)) revert InvalidMerkleRoot();

        // Verify ZK proof
        if (!_verifyWithdrawProof(proof, nullifierHash, root, amount, recipient)) {
            revert InvalidProof();
        }

        nullifierSpent[nullifierHash] = true;
        token.safeTransfer(recipient, amount);

        emit Withdrawal(nullifierHash, recipient, amount);
    }

    // ============ Transfer (spender-initiated) ============

    /// @notice Transfer tokens on behalf of a user (only approved spenders can call)
    /// @dev Used by approved spenders to execute transfers on behalf of users.
    ///      Creates output note instead of direct transfer for privacy.
    /// @param proof ZK proof from the user authorizing the transfer
    /// @param nullifierHash Hash of the nullifier being spent
    /// @param root The merkle root being proven against
    /// @param outputCommitment Commitment for the recipient's note
    /// @param outputAmount Amount to transfer to recipient
    /// @param changeCommitment Commitment for change note (0 if no change)
    /// @param changeAmount Amount in change note
    function transfer(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        bytes32 outputCommitment,
        uint256 outputAmount,
        bytes32 changeCommitment,
        uint256 changeAmount
    ) external nonReentrant whenNotPaused onlyApprovedSpender {
        if (outputAmount == 0 && changeAmount == 0) revert InvalidAmount();

        // Check tree capacity upfront to prevent partial execution
        uint32 slotsNeeded = 0;
        if (outputAmount > 0) slotsNeeded++;
        if (changeAmount > 0) slotsNeeded++;
        if (nextLeafIndex + slotsNeeded > MAX_LEAVES) revert TreeFull();

        if (nullifierSpent[nullifierHash]) revert NullifierAlreadySpent();
        if (!isKnownRoot(root)) revert InvalidMerkleRoot();

        // Verify ZK proof
        if (!_verifyTransferProof(proof, nullifierHash, root, outputCommitment, outputAmount, changeCommitment, changeAmount)) {
            revert InvalidProof();
        }

        nullifierSpent[nullifierHash] = true;

        // Create output note for recipient
        if (outputAmount > 0) {
            if (outputCommitment == bytes32(0)) revert InvalidCommitment();
            if (noteAmounts[outputCommitment] != 0) revert CommitmentAlreadyExists();
            noteAmounts[outputCommitment] = outputAmount;
            uint32 outputLeafIndex = _insertLeaf(outputCommitment);
            commitmentIndex[outputCommitment] = outputLeafIndex + 1;
        }

        // Create change note if change > 0
        if (changeAmount > 0) {
            if (changeCommitment == bytes32(0)) revert InvalidCommitment();
            if (noteAmounts[changeCommitment] != 0) revert CommitmentAlreadyExists();
            noteAmounts[changeCommitment] = changeAmount;
            uint32 changeLeafIndex = _insertLeaf(changeCommitment);
            commitmentIndex[changeCommitment] = changeLeafIndex + 1;
        }

        emit Transfer(nullifierHash, outputCommitment, outputAmount, changeCommitment, changeAmount);
    }

    // ============ View Functions ============

    /// @notice Check if a merkle root is known (O(1) lookup)
    function isKnownRoot(bytes32 root) public view returns (bool) {
        if (root == bytes32(0)) return false;
        return rootExists[root];
    }

    /// @notice Get the latest merkle root
    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }

    /// @notice Get the current leaf count
    function getLeafCount() external view returns (uint32) {
        return nextLeafIndex;
    }

    /// @notice Check if a commitment exists in the pool
    /// @param commitment The commitment to check
    /// @return exists Whether the commitment exists
    /// @return leafIndex The leaf index (only valid if exists is true)
    function getCommitmentData(bytes32 commitment) external view returns (bool exists, uint32 leafIndex) {
        uint32 storedIndex = commitmentIndex[commitment];
        if (storedIndex == 0) {
            return (false, 0);
        }
        return (true, storedIndex - 1);  // Convert back from 1-based
    }

    /// @notice Batch check if nullifiers are spent
    /// @param nullifiers Array of nullifier hashes to check
    /// @return spent Array of booleans indicating if each nullifier is spent
    function batchCheckNullifiers(bytes32[] calldata nullifiers) external view returns (bool[] memory spent) {
        spent = new bool[](nullifiers.length);
        for (uint256 i = 0; i < nullifiers.length; i++) {
            spent[i] = nullifierSpent[nullifiers[i]];
        }
    }

    /// @notice Get pool statistics for dashboard
    /// @return totalDeposited Total token balance in pool
    /// @return leafCount Number of leaves in merkle tree
    /// @return currentRoot Current merkle root
    /// @return treeCapacity Maximum tree capacity
    function getPoolStats() external view returns (
        uint256 totalDeposited,
        uint32 leafCount,
        bytes32 currentRoot,
        uint32 treeCapacity
    ) {
        return (
            token.balanceOf(address(this)),
            nextLeafIndex,
            roots[currentRootIndex],
            MAX_LEAVES
        );
    }

    /// @notice Get merkle path indices for a leaf
    /// @dev WARNING: This function only returns path INDICES (left/right positions),
    ///      NOT the actual sibling hashes. For production proof generation, use an
    ///      off-chain indexer that tracks all leaves. The contract only stores
    ///      filledSubtrees (leftmost path), not all sibling hashes.
    /// @param leafIndex The leaf index to get path for
    /// @return pathIndices Array of 0/1 indicating left/right position at each level
    function getMerklePathIndices(uint32 leafIndex) external view returns (uint8[] memory pathIndices) {
        if (leafIndex >= nextLeafIndex) {
            return new uint8[](0);
        }

        pathIndices = new uint8[](MERKLE_TREE_LEVELS);
        uint32 idx = leafIndex;
        for (uint32 i = 0; i < MERKLE_TREE_LEVELS; i++) {
            pathIndices[i] = (idx % 2 == 0) ? 0 : 1;
            idx /= 2;
        }
    }

    /// @notice Get root at a specific history index
    /// @param index The index in the root history (0 to ROOT_HISTORY_SIZE-1)
    function getRootAtIndex(uint32 index) external view returns (bytes32) {
        if (index >= ROOT_HISTORY_SIZE) return bytes32(0);
        return roots[index];
    }

    /// @notice Get the status of a merkle root for proof freshness checking
    /// @dev Useful for frontends to warn users when their proof is close to expiring.
    ///      Searches backwards through root history (O(n) but acceptable for view function).
    /// @param root The merkle root to check
    /// @return exists Whether the root is currently valid
    /// @return depositsAgo How many deposits have occurred since this root (0 = current root)
    /// @return depositsUntilExpiry How many more deposits until this root expires (0 = expired or not found)
    function getRootStatus(bytes32 root) external view returns (
        bool exists,
        uint32 depositsAgo,
        uint32 depositsUntilExpiry
    ) {
        if (root == bytes32(0) || !rootExists[root]) {
            return (false, 0, 0);
        }

        // Search backwards from current root to find when this root was created
        // This is O(ROOT_HISTORY_SIZE) but acceptable for a view function
        for (uint32 i = 0; i < ROOT_HISTORY_SIZE; i++) {
            uint32 index = (currentRootIndex + ROOT_HISTORY_SIZE - i) % ROOT_HISTORY_SIZE;
            if (roots[index] == root) {
                // Found it: i deposits ago, will expire after (ROOT_HISTORY_SIZE - 1 - i) more deposits
                uint32 remaining = ROOT_HISTORY_SIZE - 1 - i;
                return (true, i, remaining);
            }
            // Stop early if we hit an empty slot (tree has fewer than ROOT_HISTORY_SIZE roots)
            if (roots[index] == bytes32(0)) {
                break;
            }
        }

        // Should not reach here if rootExists[root] is true, but handle gracefully
        return (false, 0, 0);
    }

    // ============ Internal Functions ============

    /// @notice Insert a new leaf into the incremental Merkle tree
    /// @dev Uses an optimized incremental Merkle tree algorithm that only stores
    ///      the leftmost path (filledSubtrees). Updates root history in a circular
    ///      buffer, invalidating roots older than ROOT_HISTORY_SIZE deposits.
    /// @param leaf The commitment hash to insert as a leaf
    /// @return The index of the inserted leaf (0-based)
    function _insertLeaf(bytes32 leaf) internal returns (uint32) {
        uint32 leafIndex = nextLeafIndex;
        if (leafIndex >= MAX_LEAVES) revert TreeFull();

        bytes32 currentHash = leaf;

        for (uint32 i = 0; i < MERKLE_TREE_LEVELS; i++) {
            if (leafIndex % 2 == 0) {
                filledSubtrees[i] = currentHash;
                currentHash = hashLeftRight(currentHash, ZEROS[i]);
            } else {
                currentHash = hashLeftRight(filledSubtrees[i], currentHash);
            }
            leafIndex /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;

        // Invalidate the old root at this index to enforce ROOT_HISTORY_SIZE limit
        bytes32 oldRoot = roots[newRootIndex];
        if (oldRoot != bytes32(0)) {
            rootExists[oldRoot] = false;
        }

        currentRootIndex = newRootIndex;
        roots[currentRootIndex] = currentHash;
        rootExists[currentHash] = true;
        nextLeafIndex++;

        emit LeafInserted(leaf, nextLeafIndex - 1, currentHash);

        return nextLeafIndex - 1;
    }

    /// @notice Verify a ZK proof for withdrawal
    /// @dev Calls the withdrawVerifier contract using the typed interface.
    ///      Reverts are caught and treated as invalid proofs.
    /// @param proof The ZK proof bytes
    /// @param nullifierHash Hash of the nullifier being spent
    /// @param root The Merkle root being proven against
    /// @param amount The amount being withdrawn
    /// @param recipient The address receiving the withdrawal
    /// @return True if the proof is valid, false otherwise
    function _verifyWithdrawProof(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        uint256 amount,
        address recipient
    ) internal view returns (bool) {
        // Use try/catch to handle any revert from the verifier gracefully
        try withdrawVerifier.verify(proof, nullifierHash, root, amount, recipient) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

    /// @notice Verify a ZK proof for transfer (spender-initiated)
    /// @dev Calls the transferVerifier contract using the typed interface.
    ///      Reverts are caught and treated as invalid proofs.
    ///      The ZK circuit must enforce the conservation law: inputAmount = outputAmount + changeAmount
    /// @param proof The ZK proof bytes
    /// @param nullifierHash Hash of the nullifier being spent
    /// @param root The Merkle root being proven against
    /// @param outputCommitment Commitment for the recipient's new note
    /// @param outputAmount Amount in the output note
    /// @param changeCommitment Commitment for the sender's change note
    /// @param changeAmount Amount in the change note
    /// @return True if the proof is valid, false otherwise
    function _verifyTransferProof(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        bytes32 outputCommitment,
        uint256 outputAmount,
        bytes32 changeCommitment,
        uint256 changeAmount
    ) internal view returns (bool) {
        // Use try/catch to handle any revert from the verifier gracefully
        try transferVerifier.verify(
            proof,
            nullifierHash,
            root,
            outputCommitment,
            outputAmount,
            changeCommitment,
            changeAmount
        ) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

    /// @dev Hash two nodes together using keccak256
    function hashLeftRight(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encodePacked(left, right))) % FIELD_SIZE);
    }

    /// @dev Get zero value at a given level (uses precomputed values)
    function zeros(uint256 level) public view returns (bytes32) {
        if (level >= MERKLE_TREE_LEVELS) revert LevelOutOfBounds();
        return ZEROS[level];
    }
}
