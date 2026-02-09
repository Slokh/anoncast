// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Interface for AnonPool transfer function
interface IAnonPool {
    function transfer(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        bytes32 outputCommitment,
        uint256 outputAmount,
        bytes32 changeCommitment,
        uint256 changeAmount
    ) external;
}

/// @title AnonPoolAuctionSpender
/// @notice Safety wrapper for AnonPool.transfer() with slot-based rate limiting
/// @dev Allows only one settlement per slot to prevent double-spending from compromised keys.
///      All configuration is immutable - deploy a new contract to change settings.
contract AnonPoolAuctionSpender is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Duration of a slot in seconds (1 hour)
    uint256 public constant SLOT_DURATION = 1 hours;

    /// @notice Minimum settlement window duration (1 minute)
    uint256 public constant MIN_SETTLEMENT_WINDOW = 1 minutes;

    // ============ Immutables ============

    /// @notice The AnonPool contract this spender wraps
    IAnonPool public immutable anonPool;

    /// @notice Timestamp when slot 0 starts
    uint256 public immutable slotStartTime;

    /// @notice Backend address that calls settle()
    address public immutable operator;

    /// @notice Seconds after slot end when settlement can start
    uint256 public immutable settlementWindowStart;

    /// @notice Seconds after slot end when settlement window closes
    uint256 public immutable settlementWindowEnd;

    // ============ State ============

    /// @notice Tracks which slots have been settled (slotId => settled)
    mapping(uint256 => bool) public slotSettled;

    // ============ Events ============

    event SlotSettled(
        uint256 indexed slotId,
        bytes32 indexed outputCommitment,
        uint256 outputAmount,
        bytes32 indexed changeCommitment,
        uint256 changeAmount
    );

    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    // ============ Errors ============

    error OnlyOperator();
    error SlotAlreadySettled();
    error SlotNotYetSettleable();
    error SlotSettlementWindowClosed();
    error SlotInFuture();
    error BeforeSlotStartTime();
    error InvalidSettlementWindow();
    error InvalidSlotStartTime();
    error ZeroAddress();
    error ETHTransferFailed();

    // ============ Modifiers ============

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    // ============ Constructor ============

    /// @notice Deploy the AnonPoolAuctionSpender contract
    /// @param _anonPool Address of the AnonPool contract
    /// @param _operator Address of the backend operator
    /// @param _slotStartTime Timestamp when slot 0 starts
    /// @param _settlementWindowStart Seconds after slot end when settlement can start
    /// @param _settlementWindowEnd Seconds after slot end when window closes
    constructor(
        address _anonPool,
        address _operator,
        uint256 _slotStartTime,
        uint256 _settlementWindowStart,
        uint256 _settlementWindowEnd
    ) Ownable(msg.sender) {
        if (_anonPool == address(0)) revert ZeroAddress();
        if (_operator == address(0)) revert ZeroAddress();
        if (_slotStartTime == 0) revert InvalidSlotStartTime();

        // Settlement window validation:
        // 1. Window must have positive duration (end > start)
        if (_settlementWindowEnd <= _settlementWindowStart) revert InvalidSettlementWindow();

        // 2. Window must be at least MIN_SETTLEMENT_WINDOW (1 minute) to give operator
        //    reasonable time to submit settlement transactions
        if (_settlementWindowEnd - _settlementWindowStart < MIN_SETTLEMENT_WINDOW) revert InvalidSettlementWindow();

        // 3. Window must end within SLOT_DURATION (1 hour) after slot ends.
        //    This prevents overlapping settlement windows between consecutive slots.
        //    Example: If settlementWindowEnd = 2 hours, then slot N's window would
        //    overlap with slot N+1's window, defeating the rate-limiting protection.
        if (_settlementWindowEnd > SLOT_DURATION) revert InvalidSettlementWindow();

        anonPool = IAnonPool(_anonPool);
        operator = _operator;
        slotStartTime = _slotStartTime;
        settlementWindowStart = _settlementWindowStart;
        settlementWindowEnd = _settlementWindowEnd;
    }

    // ============ Main Entry Point ============

    /// @notice Settle an auction slot by calling AnonPool.transfer()
    /// @dev Only callable by the operator within the settlement window. One settlement per slot.
    /// @param slotId The auction slot ID to settle
    /// @param proof ZK proof from the user authorizing the transfer
    /// @param nullifierHash Hash of the nullifier being spent
    /// @param root The merkle root being proven against
    /// @param outputCommitment Commitment for the recipient's note
    /// @param outputAmount Amount to transfer to recipient
    /// @param changeCommitment Commitment for change note (0 if no change)
    /// @param changeAmount Amount in change note
    function settle(
        uint256 slotId,
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        bytes32 outputCommitment,
        uint256 outputAmount,
        bytes32 changeCommitment,
        uint256 changeAmount
    ) external onlyOperator whenNotPaused nonReentrant {
        // Check slot hasn't been settled
        if (slotSettled[slotId]) revert SlotAlreadySettled();

        // Validate slot timing
        _validateSlotTiming(slotId);

        // Mark slot as settled before external call (CEI pattern)
        slotSettled[slotId] = true;

        // Emit event before external call for consistent indexer behavior
        emit SlotSettled(slotId, outputCommitment, outputAmount, changeCommitment, changeAmount);

        // Call AnonPool.transfer()
        anonPool.transfer(
            proof,
            nullifierHash,
            root,
            outputCommitment,
            outputAmount,
            changeCommitment,
            changeAmount
        );
    }

    // ============ View Functions ============

    /// @notice Get the start and end timestamps for a slot
    /// @dev Returns (0, 0) for slotIds that would cause overflow
    /// @param slotId The slot ID
    /// @return startTime When the slot starts (0 if overflow)
    /// @return endTime When the slot ends (0 if overflow)
    function getSlotTimes(uint256 slotId) public view returns (uint256 startTime, uint256 endTime) {
        // Check for overflow: slotId * SLOT_DURATION + slotStartTime + SLOT_DURATION must not overflow
        // Simplified: slotId must be less than (max - slotStartTime - SLOT_DURATION) / SLOT_DURATION
        unchecked {
            uint256 maxSlotId = (type(uint256).max - slotStartTime - SLOT_DURATION) / SLOT_DURATION;
            if (slotId > maxSlotId) {
                return (0, 0);
            }
        }
        startTime = slotStartTime + (slotId * SLOT_DURATION);
        endTime = startTime + SLOT_DURATION;
    }

    /// @notice Get the settlement window for a slot
    /// @param slotId The slot ID
    /// @return windowStart When settlement can start
    /// @return windowEnd When settlement window closes
    function getSettlementWindow(uint256 slotId) public view returns (uint256 windowStart, uint256 windowEnd) {
        (, uint256 slotEnd) = getSlotTimes(slotId);
        windowStart = slotEnd + settlementWindowStart;
        windowEnd = slotEnd + settlementWindowEnd;
    }

    /// @notice Check if a slot can currently be settled
    /// @param slotId The slot ID
    /// @return settleable Whether the slot can be settled
    /// @return reason Human-readable reason if can't settle
    function canSettle(uint256 slotId) external view returns (bool settleable, string memory reason) {
        if (paused()) {
            return (false, "Contract is paused");
        }

        if (block.timestamp < slotStartTime) {
            return (false, "Before slot start time");
        }

        if (slotSettled[slotId]) {
            return (false, "Slot already settled");
        }

        (uint256 windowStart, uint256 windowEnd) = getSettlementWindow(slotId);

        if (block.timestamp < windowStart) {
            return (false, "Settlement window not yet open");
        }

        if (block.timestamp > windowEnd) {
            return (false, "Settlement window closed");
        }

        return (true, "");
    }

    /// @notice Get the current slot ID based on block timestamp
    /// @return started Whether the slot system has started (block.timestamp >= slotStartTime)
    /// @return slotId The current slot ID (only valid if started is true)
    function getCurrentSlotId() external view returns (bool started, uint256 slotId) {
        if (block.timestamp < slotStartTime) {
            return (false, 0);
        }
        return (true, (block.timestamp - slotStartTime) / SLOT_DURATION);
    }

    // ============ Admin Functions ============

    /// @notice Pause all settlements
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause settlements
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Emergency withdrawal of tokens accidentally sent to this contract
    /// @dev This contract should not hold tokens normally - they flow through AnonPool
    /// @param token Token address to withdraw (address(0) for ETH)
    /// @param amount Amount to withdraw
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(owner()).call{value: amount}("");
            if (!success) revert ETHTransferFailed();
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
        emit EmergencyWithdraw(token, owner(), amount);
    }

    // ============ Internal Functions ============

    /// @notice Validates that a slot can be settled based on timing constraints
    /// @dev Checks three conditions:
    ///      1. Current time is after slotStartTime (slot system has begun)
    ///      2. The requested slot is not in the future
    ///      3. Current time is within the settlement window for this slot
    /// @param slotId The slot ID to validate timing for
    function _validateSlotTiming(uint256 slotId) internal view {
        // Check we're past the slot start time
        if (block.timestamp < slotStartTime) revert BeforeSlotStartTime();

        (uint256 slotStart, uint256 slotEnd) = getSlotTimes(slotId);

        // Check slot is not in the future
        if (slotStart > block.timestamp) revert SlotInFuture();

        // Calculate settlement window
        uint256 windowStart = slotEnd + settlementWindowStart;
        uint256 windowEnd = slotEnd + settlementWindowEnd;

        // Check we're within the settlement window
        if (block.timestamp < windowStart) revert SlotNotYetSettleable();
        if (block.timestamp > windowEnd) revert SlotSettlementWindowClosed();
    }

    /// @dev Allow contract to receive ETH for emergency withdrawal
    receive() external payable {}
}
