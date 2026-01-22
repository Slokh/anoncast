// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AuctionSpender, IAnonPool} from "../contracts/AuctionSpender.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Mock AnonPool for testing
contract MockAnonPool {
    IERC20 public token;
    uint256 public transferCallCount;
    bytes public lastProof;
    bytes32 public lastNullifierHash;
    bytes32 public lastRoot;
    bytes32 public lastOutputCommitment;
    uint256 public lastOutputAmount;
    bytes32 public lastChangeCommitment;
    uint256 public lastChangeAmount;

    bool public shouldRevert;
    string public revertReason;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function transfer(
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 root,
        bytes32 outputCommitment,
        uint256 outputAmount,
        bytes32 changeCommitment,
        uint256 changeAmount
    ) external {
        if (shouldRevert) {
            revert(revertReason);
        }

        transferCallCount++;
        lastProof = proof;
        lastNullifierHash = nullifierHash;
        lastRoot = root;
        lastOutputCommitment = outputCommitment;
        lastOutputAmount = outputAmount;
        lastChangeCommitment = changeCommitment;
        lastChangeAmount = changeAmount;
    }

    function setRevert(bool _shouldRevert, string memory _reason) external {
        shouldRevert = _shouldRevert;
        revertReason = _reason;
    }
}

/// @notice Mock ERC20 for testing
contract MockERC20 {
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract AuctionSpenderTest is Test {
    AuctionSpender public spender;
    MockAnonPool public mockPool;
    MockERC20 public mockToken;

    address public owner = address(0x1111);
    address public operator = address(0x2222);
    address public randomUser = address(0x3333);

    uint256 public constant SLOT_START_TIME = 1000;
    uint256 public constant SETTLEMENT_WINDOW_START = 0;
    uint256 public constant SETTLEMENT_WINDOW_END = 300; // 5 minutes

    // Test data
    bytes public testProof = hex"1234";
    bytes32 public testNullifierHash = keccak256("nullifier");
    bytes32 public testRoot = keccak256("root");
    bytes32 public testOutputCommitment = keccak256("output");
    bytes32 public testChangeCommitment = keccak256("change");

    function setUp() public {
        vm.startPrank(owner);

        mockToken = new MockERC20();
        mockPool = new MockAnonPool(address(mockToken));

        spender = new AuctionSpender(
            address(mockPool),
            operator,
            SLOT_START_TIME,
            SETTLEMENT_WINDOW_START,
            SETTLEMENT_WINDOW_END
        );

        vm.stopPrank();
    }

    // ============ Constructor Tests ============

    function test_Constructor_SetsCorrectValues() public view {
        assertEq(address(spender.anonPool()), address(mockPool));
        assertEq(spender.operator(), operator);
        assertEq(spender.slotStartTime(), SLOT_START_TIME);
        assertEq(spender.settlementWindowStart(), SETTLEMENT_WINDOW_START);
        assertEq(spender.settlementWindowEnd(), SETTLEMENT_WINDOW_END);
        assertEq(spender.owner(), owner);
    }

    function test_Constructor_RevertsOnZeroAnonPool() public {
        vm.prank(owner);
        vm.expectRevert(AuctionSpender.ZeroAddress.selector);
        new AuctionSpender(
            address(0),
            operator,
            SLOT_START_TIME,
            SETTLEMENT_WINDOW_START,
            SETTLEMENT_WINDOW_END
        );
    }

    function test_Constructor_RevertsOnZeroOperator() public {
        vm.prank(owner);
        vm.expectRevert(AuctionSpender.ZeroAddress.selector);
        new AuctionSpender(
            address(mockPool),
            address(0),
            SLOT_START_TIME,
            SETTLEMENT_WINDOW_START,
            SETTLEMENT_WINDOW_END
        );
    }

    function test_Constructor_RevertsOnZeroSlotStartTime() public {
        vm.prank(owner);
        vm.expectRevert(AuctionSpender.InvalidSlotStartTime.selector);
        new AuctionSpender(
            address(mockPool),
            operator,
            0,
            SETTLEMENT_WINDOW_START,
            SETTLEMENT_WINDOW_END
        );
    }

    function test_Constructor_RevertsOnInvalidWindow_EndLessThanStart() public {
        vm.prank(owner);
        vm.expectRevert(AuctionSpender.InvalidSettlementWindow.selector);
        new AuctionSpender(
            address(mockPool),
            operator,
            SLOT_START_TIME,
            300, // start
            100  // end < start
        );
    }

    function test_Constructor_RevertsOnInvalidWindow_EndEqualsStart() public {
        vm.prank(owner);
        vm.expectRevert(AuctionSpender.InvalidSettlementWindow.selector);
        new AuctionSpender(
            address(mockPool),
            operator,
            SLOT_START_TIME,
            300, // start
            300  // end == start
        );
    }

    function test_Constructor_RevertsOnWindowTooSmall() public {
        vm.prank(owner);
        vm.expectRevert(AuctionSpender.InvalidSettlementWindow.selector);
        new AuctionSpender(
            address(mockPool),
            operator,
            SLOT_START_TIME,
            0,
            30   // 30 seconds < MIN_SETTLEMENT_WINDOW (60 seconds)
        );
    }

    function test_Constructor_RevertsOnOverlappingWindows() public {
        vm.prank(owner);
        vm.expectRevert(AuctionSpender.InvalidSettlementWindow.selector);
        new AuctionSpender(
            address(mockPool),
            operator,
            SLOT_START_TIME,
            0,
            3601  // > SLOT_DURATION (3600), would cause overlapping windows
        );
    }

    function test_Constructor_AcceptsMaxValidWindow() public {
        vm.prank(owner);
        // Window of exactly SLOT_DURATION should be allowed
        AuctionSpender validSpender = new AuctionSpender(
            address(mockPool),
            operator,
            SLOT_START_TIME,
            0,
            3600  // exactly SLOT_DURATION
        );
        assertEq(validSpender.settlementWindowEnd(), 3600);
    }

    function test_Constructor_AcceptsMinValidWindow() public {
        vm.prank(owner);
        // Window of exactly MIN_SETTLEMENT_WINDOW should be allowed
        AuctionSpender validSpender = new AuctionSpender(
            address(mockPool),
            operator,
            SLOT_START_TIME,
            0,
            60  // exactly MIN_SETTLEMENT_WINDOW
        );
        assertEq(validSpender.settlementWindowEnd(), 60);
    }

    // ============ Settle Tests ============

    function test_Settle_Success() public {
        vm.warp(SLOT_START_TIME + 1 hours + 1 minutes);

        uint256 outputAmount = 50_000 * 1e18;
        uint256 changeAmount = 10_000 * 1e18;

        vm.prank(operator);
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            outputAmount,
            testChangeCommitment,
            changeAmount
        );

        assertEq(mockPool.transferCallCount(), 1);
        assertEq(mockPool.lastOutputAmount(), outputAmount);
        assertEq(mockPool.lastChangeAmount(), changeAmount);
        assertEq(mockPool.lastOutputCommitment(), testOutputCommitment);
        assertTrue(spender.slotSettled(0));
    }

    function test_Settle_LargeAmount() public {
        vm.warp(SLOT_START_TIME + 1 hours + 1 minutes);

        uint256 largeAmount = 1_000_000_000 * 1e18;

        vm.prank(operator);
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            largeAmount,
            testChangeCommitment,
            0
        );

        assertEq(mockPool.lastOutputAmount(), largeAmount);
        assertTrue(spender.slotSettled(0));
    }

    function test_Settle_RevertsOnNonOperator() public {
        vm.warp(SLOT_START_TIME + 1 hours + 1 minutes);

        vm.prank(randomUser);
        vm.expectRevert(AuctionSpender.OnlyOperator.selector);
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            testChangeCommitment,
            0
        );
    }

    function test_Settle_RevertsOnDoubleSettlement() public {
        vm.warp(SLOT_START_TIME + 1 hours + 1 minutes);

        vm.startPrank(operator);

        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            testChangeCommitment,
            0
        );

        vm.expectRevert(AuctionSpender.SlotAlreadySettled.selector);
        spender.settle(
            0,
            testProof,
            keccak256("different_nullifier"),
            testRoot,
            keccak256("different_output"),
            50_000 * 1e18,
            testChangeCommitment,
            0
        );

        vm.stopPrank();
    }

    function test_Settle_RevertsWhenPaused() public {
        vm.warp(SLOT_START_TIME + 1 hours + 1 minutes);

        vm.prank(owner);
        spender.pause();

        vm.prank(operator);
        vm.expectRevert();
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            testChangeCommitment,
            0
        );
    }

    // ============ Settlement Window Tests ============

    function test_Settle_RevertsBeforeSlotStartTime() public {
        vm.warp(SLOT_START_TIME - 1);

        vm.prank(operator);
        vm.expectRevert(AuctionSpender.BeforeSlotStartTime.selector);
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            testChangeCommitment,
            0
        );
    }

    function test_Settle_RevertsOnSlotInFuture() public {
        vm.warp(SLOT_START_TIME + 30 minutes);

        vm.prank(operator);
        vm.expectRevert(AuctionSpender.SlotInFuture.selector);
        spender.settle(
            1,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            testChangeCommitment,
            0
        );
    }

    function test_Settle_RevertsBeforeSettlementWindowOpens() public {
        vm.warp(SLOT_START_TIME + 59 minutes);

        vm.prank(operator);
        vm.expectRevert(AuctionSpender.SlotNotYetSettleable.selector);
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            testChangeCommitment,
            0
        );
    }

    function test_Settle_RevertsAfterSettlementWindowCloses() public {
        vm.warp(SLOT_START_TIME + 1 hours + 6 minutes);

        vm.prank(operator);
        vm.expectRevert(AuctionSpender.SlotSettlementWindowClosed.selector);
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            testChangeCommitment,
            0
        );
    }

    function test_Settle_SucceedsAtWindowBoundaries() public {
        // Test at exact window start
        vm.warp(SLOT_START_TIME + 1 hours);

        vm.prank(operator);
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            testChangeCommitment,
            0
        );

        assertTrue(spender.slotSettled(0));

        // Test at exact window end for a different slot
        vm.warp(SLOT_START_TIME + 2 hours + SETTLEMENT_WINDOW_END);

        vm.prank(operator);
        spender.settle(
            1,
            testProof,
            keccak256("nullifier2"),
            testRoot,
            keccak256("output2"),
            50_000 * 1e18,
            testChangeCommitment,
            0
        );

        assertTrue(spender.slotSettled(1));
    }

    // ============ View Function Tests ============

    function test_GetSlotTimes() public view {
        (uint256 start0, uint256 end0) = spender.getSlotTimes(0);
        assertEq(start0, SLOT_START_TIME);
        assertEq(end0, SLOT_START_TIME + 1 hours);

        (uint256 start1, uint256 end1) = spender.getSlotTimes(1);
        assertEq(start1, SLOT_START_TIME + 1 hours);
        assertEq(end1, SLOT_START_TIME + 2 hours);

        (uint256 start100, uint256 end100) = spender.getSlotTimes(100);
        assertEq(start100, SLOT_START_TIME + 100 hours);
        assertEq(end100, SLOT_START_TIME + 101 hours);
    }

    function test_GetSlotTimes_OverflowProtection() public view {
        // Very large slotId that would overflow - should return (0, 0)
        (uint256 start, uint256 end) = spender.getSlotTimes(type(uint256).max);
        assertEq(start, 0);
        assertEq(end, 0);

        // Another overflow case
        (uint256 start2, uint256 end2) = spender.getSlotTimes(type(uint256).max / 2);
        assertEq(start2, 0);
        assertEq(end2, 0);
    }

    function test_GetSettlementWindow() public view {
        (uint256 windowStart, uint256 windowEnd) = spender.getSettlementWindow(0);
        assertEq(windowStart, SLOT_START_TIME + 1 hours + SETTLEMENT_WINDOW_START);
        assertEq(windowEnd, SLOT_START_TIME + 1 hours + SETTLEMENT_WINDOW_END);

        (uint256 windowStart1, uint256 windowEnd1) = spender.getSettlementWindow(5);
        assertEq(windowStart1, SLOT_START_TIME + 6 hours + SETTLEMENT_WINDOW_START);
        assertEq(windowEnd1, SLOT_START_TIME + 6 hours + SETTLEMENT_WINDOW_END);
    }

    function test_CanSettle() public {
        // Before slot start time
        vm.warp(SLOT_START_TIME - 1);
        (bool canSettleNow, string memory reason) = spender.canSettle(0);
        assertFalse(canSettleNow);
        assertEq(reason, "Before slot start time");

        // Before window opens
        vm.warp(SLOT_START_TIME + 30 minutes);
        (canSettleNow, reason) = spender.canSettle(0);
        assertFalse(canSettleNow);
        assertEq(reason, "Settlement window not yet open");

        // During window
        vm.warp(SLOT_START_TIME + 1 hours + 1 minutes);
        (canSettleNow, reason) = spender.canSettle(0);
        assertTrue(canSettleNow);
        assertEq(reason, "");

        // After window closes
        vm.warp(SLOT_START_TIME + 1 hours + 10 minutes);
        (canSettleNow, reason) = spender.canSettle(0);
        assertFalse(canSettleNow);
        assertEq(reason, "Settlement window closed");

        // Already settled
        vm.warp(SLOT_START_TIME + 2 hours + 1 minutes);
        vm.prank(operator);
        spender.settle(
            1,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            1000,
            testChangeCommitment,
            0
        );
        (canSettleNow, reason) = spender.canSettle(1);
        assertFalse(canSettleNow);
        assertEq(reason, "Slot already settled");

        // When paused
        vm.prank(owner);
        spender.pause();
        vm.warp(SLOT_START_TIME + 3 hours + 1 minutes);
        (canSettleNow, reason) = spender.canSettle(2);
        assertFalse(canSettleNow);
        assertEq(reason, "Contract is paused");
    }

    function test_GetCurrentSlotId() public {
        // Before slot start time - returns (false, 0)
        vm.warp(SLOT_START_TIME - 1);
        (bool started, uint256 slotId) = spender.getCurrentSlotId();
        assertFalse(started);
        assertEq(slotId, 0);

        // At slot start time
        vm.warp(SLOT_START_TIME);
        (started, slotId) = spender.getCurrentSlotId();
        assertTrue(started);
        assertEq(slotId, 0);

        vm.warp(SLOT_START_TIME + 30 minutes);
        (started, slotId) = spender.getCurrentSlotId();
        assertTrue(started);
        assertEq(slotId, 0);

        vm.warp(SLOT_START_TIME + 1 hours);
        (started, slotId) = spender.getCurrentSlotId();
        assertTrue(started);
        assertEq(slotId, 1);

        vm.warp(SLOT_START_TIME + 100 hours + 30 minutes);
        (started, slotId) = spender.getCurrentSlotId();
        assertTrue(started);
        assertEq(slotId, 100);
    }

    // ============ Admin Function Tests ============

    function test_Pause_Success() public {
        vm.prank(owner);
        spender.pause();

        assertTrue(spender.paused());
    }

    function test_Pause_RevertsOnNonOwner() public {
        vm.prank(randomUser);
        vm.expectRevert();
        spender.pause();
    }

    function test_Unpause_Success() public {
        vm.prank(owner);
        spender.pause();

        vm.prank(owner);
        spender.unpause();

        assertFalse(spender.paused());
    }

    function test_Unpause_RevertsOnNonOwner() public {
        vm.prank(owner);
        spender.pause();

        vm.prank(randomUser);
        vm.expectRevert();
        spender.unpause();
    }

    function test_EmergencyWithdraw_ERC20() public {
        mockToken.mint(address(spender), 1000);

        uint256 ownerBalanceBefore = mockToken.balanceOf(owner);

        vm.prank(owner);
        spender.emergencyWithdraw(address(mockToken), 1000);

        assertEq(mockToken.balanceOf(owner), ownerBalanceBefore + 1000);
        assertEq(mockToken.balanceOf(address(spender)), 0);
    }

    function test_EmergencyWithdraw_ETH() public {
        vm.deal(address(spender), 1 ether);

        uint256 ownerBalanceBefore = owner.balance;

        vm.prank(owner);
        spender.emergencyWithdraw(address(0), 1 ether);

        assertEq(owner.balance, ownerBalanceBefore + 1 ether);
        assertEq(address(spender).balance, 0);
    }

    function test_EmergencyWithdraw_RevertsOnNonOwner() public {
        vm.deal(address(spender), 1 ether);

        vm.prank(randomUser);
        vm.expectRevert();
        spender.emergencyWithdraw(address(0), 1 ether);
    }

    // ============ Edge Case Tests ============

    function test_SettleMultipleConsecutiveSlots() public {
        vm.startPrank(operator);

        for (uint256 i = 0; i < 5; i++) {
            vm.warp(SLOT_START_TIME + (i + 1) * 1 hours + 1 minutes);

            spender.settle(
                i,
                testProof,
                keccak256(abi.encodePacked("nullifier", i)),
                testRoot,
                keccak256(abi.encodePacked("output", i)),
                10_000 * 1e18,
                bytes32(0),
                0
            );

            assertTrue(spender.slotSettled(i));
        }

        assertEq(mockPool.transferCallCount(), 5);

        vm.stopPrank();
    }

    function test_SettleWithZeroChangeAmount() public {
        vm.warp(SLOT_START_TIME + 1 hours + 1 minutes);

        vm.prank(operator);
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            bytes32(0),
            0
        );

        assertEq(mockPool.lastChangeCommitment(), bytes32(0));
        assertEq(mockPool.lastChangeAmount(), 0);
    }

    function test_AnonPoolRevertBubblesUp() public {
        vm.warp(SLOT_START_TIME + 1 hours + 1 minutes);

        mockPool.setRevert(true, "InvalidProof");

        vm.prank(operator);
        vm.expectRevert("InvalidProof");
        spender.settle(
            0,
            testProof,
            testNullifierHash,
            testRoot,
            testOutputCommitment,
            50_000 * 1e18,
            testChangeCommitment,
            0
        );
    }

    function test_ReceiveETH() public {
        vm.deal(address(this), 1 ether);
        (bool success,) = address(spender).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(spender).balance, 1 ether);
    }

    // ============ Immutability Tests ============

    function test_OperatorIsImmutable() public view {
        // Verify operator is set correctly and cannot be changed
        assertEq(spender.operator(), operator);
        // No setter exists - this is enforced by the contract design
    }

    function test_SettlementWindowIsImmutable() public view {
        // Verify window settings are set correctly and cannot be changed
        assertEq(spender.settlementWindowStart(), SETTLEMENT_WINDOW_START);
        assertEq(spender.settlementWindowEnd(), SETTLEMENT_WINDOW_END);
        // No setter exists - this is enforced by the contract design
    }
}
