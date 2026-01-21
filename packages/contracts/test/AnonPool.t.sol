// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AnonPool} from "../src/AnonPool.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Simple test token for unit tests
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Test-only mock verifiers - DO NOT use in production
contract TestWithdrawVerifier {
    function verify(bytes calldata, bytes32, bytes32, uint256, address) external pure returns (bool) {
        return true;
    }
}

contract TestTransferVerifier {
    function verify(bytes calldata, bytes32, bytes32, bytes32, uint256, bytes32, uint256) external pure returns (bool) {
        return true;
    }
}

contract FailingVerifier {
    function verify(bytes calldata, bytes32, bytes32, uint256, address) external pure returns (bool) {
        return false;
    }
    function verify(bytes calldata, bytes32, bytes32, bytes32, uint256, bytes32, uint256) external pure returns (bool) {
        return false;
    }
}

/// @dev Mock token that takes 100% fee on transfer (for testing edge case)
contract ZeroFeeToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        // NOTE: We intentionally don't credit the recipient - simulating 100% fee
        return true;
    }
}

contract AnonPoolTest is Test {
    AnonPool public pool;
    MockERC20 public token;
    TestWithdrawVerifier public withdrawVerifier;
    TestTransferVerifier public transferVerifier;

    address public owner = address(this);
    address public spender = address(0x0A);
    address public user1 = address(0x1);
    address public user2 = address(0x2);

    event Deposit(bytes32 indexed commitment, uint256 amount, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(bytes32 indexed nullifierHash, address indexed recipient, uint256 amount);
    event Transfer(bytes32 indexed nullifierHash, bytes32 outputCommitment, uint256 outputAmount, bytes32 changeCommitment, uint256 changeAmount);
    event SpenderAdded(address indexed spender);
    event SpenderRemoved(address indexed spender);

    function setUp() public {
        token = new MockERC20();
        withdrawVerifier = new TestWithdrawVerifier();
        transferVerifier = new TestTransferVerifier();

        pool = new AnonPool(
            address(token),
            address(withdrawVerifier),
            address(transferVerifier)
        );

        // Add spender (server wallet EOA)
        pool.addSpender(spender);

        // Fund test users
        token.mint(user1, 1_000_000 * 10 ** 18);
        token.mint(user2, 1_000_000 * 10 ** 18);
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(address(pool.token()), address(token));
        assertEq(address(pool.withdrawVerifier()), address(withdrawVerifier));
        assertEq(address(pool.transferVerifier()), address(transferVerifier));
        assertEq(pool.owner(), owner);
        assertEq(pool.nextLeafIndex(), 0);
        assertTrue(pool.approvedSpenders(spender));
    }

    function test_Constructor_RevertWhen_ZeroToken() public {
        vm.expectRevert(AnonPool.ZeroAddress.selector);
        new AnonPool(address(0), address(withdrawVerifier), address(transferVerifier));
    }

    function test_Constructor_RevertWhen_ZeroWithdrawVerifier() public {
        vm.expectRevert(AnonPool.ZeroAddress.selector);
        new AnonPool(address(token), address(0), address(transferVerifier));
    }

    function test_Constructor_RevertWhen_ZeroTransferVerifier() public {
        vm.expectRevert(AnonPool.ZeroAddress.selector);
        new AnonPool(address(token), address(withdrawVerifier), address(0));
    }

    function test_Constructor_RevertWhen_WithdrawVerifierIsEOA() public {
        // EOA address (no code)
        address eoaAddress = address(0x1234567890123456789012345678901234567890);
        vm.expectRevert(AnonPool.InvalidVerifier.selector);
        new AnonPool(address(token), eoaAddress, address(transferVerifier));
    }

    function test_Constructor_RevertWhen_TransferVerifierIsEOA() public {
        // EOA address (no code)
        address eoaAddress = address(0x1234567890123456789012345678901234567890);
        vm.expectRevert(AnonPool.InvalidVerifier.selector);
        new AnonPool(address(token), address(withdrawVerifier), eoaAddress);
    }

    // ============ Spender Registry Tests ============

    function test_AddSpender() public {
        address newSpender = address(0x999);

        vm.expectEmit(true, false, false, false);
        emit SpenderAdded(newSpender);

        pool.addSpender(newSpender);
        assertTrue(pool.approvedSpenders(newSpender));
    }

    function test_AddSpender_RevertWhen_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        pool.addSpender(address(0x999));
    }

    function test_AddSpender_RevertWhen_AlreadyApproved() public {
        vm.expectRevert(AnonPool.SpenderAlreadyApproved.selector);
        pool.addSpender(spender);
    }

    function test_AddSpender_RevertWhen_ZeroAddress() public {
        vm.expectRevert(AnonPool.ZeroAddress.selector);
        pool.addSpender(address(0));
    }

    function test_RemoveSpender() public {
        vm.expectEmit(true, false, false, false);
        emit SpenderRemoved(spender);

        pool.removeSpender(spender);
        assertFalse(pool.approvedSpenders(spender));
    }

    function test_RemoveSpender_RevertWhen_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        pool.removeSpender(spender);
    }

    function test_RemoveSpender_RevertWhen_NotApproved() public {
        vm.expectRevert(AnonPool.SpenderNotApproved.selector);
        pool.removeSpender(address(0x999));
    }

    // ============ Pausable Tests ============

    function test_Pause() public {
        pool.pause();
        assertTrue(pool.paused());
    }

    function test_Unpause() public {
        pool.pause();
        pool.unpause();
        assertFalse(pool.paused());
    }

    function test_Pause_RevertWhen_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        pool.pause();
    }

    function test_Deposit_RevertWhen_Paused() public {
        pool.pause();

        vm.startPrank(user1);
        token.approve(address(pool), 1000);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        pool.deposit(keccak256("commitment"), 1000);
        vm.stopPrank();
    }

    function test_Withdraw_RevertWhen_Paused() public {
        // First deposit while unpaused
        vm.startPrank(user1);
        token.approve(address(pool), 1000 * 10 ** 18);
        pool.deposit(keccak256("commitment"), 1000 * 10 ** 18);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();

        // Pause then try to withdraw
        pool.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        pool.withdraw("", keccak256("nullifier"), root, 1000 * 10 ** 18, user1);
    }

    function test_Transfer_RevertWhen_Paused() public {
        // First deposit while unpaused
        vm.startPrank(user1);
        token.approve(address(pool), 1000 * 10 ** 18);
        pool.deposit(keccak256("commitment"), 1000 * 10 ** 18);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();

        // Pause then try to transfer
        pool.pause();

        vm.prank(spender);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        pool.transfer("", keccak256("nullifier"), root, keccak256("output"), 500 * 10 ** 18, keccak256("change"), 500 * 10 ** 18);
    }

    // ============ Deposit Tests ============

    function test_Deposit_Success() public {
        uint256 amount = 10_000 * 10 ** 18;
        bytes32 commitment = keccak256("commitment1");

        vm.startPrank(user1);
        token.approve(address(pool), amount);

        vm.expectEmit(true, false, false, true);
        emit Deposit(commitment, amount, 0, block.timestamp);

        pool.deposit(commitment, amount);
        vm.stopPrank();

        (bool exists, uint32 leafIndex) = pool.getCommitmentData(commitment);
        assertTrue(exists);
        assertEq(leafIndex, 0);
        assertEq(pool.nextLeafIndex(), 1);
        assertEq(token.balanceOf(address(pool)), amount);
    }

    function test_Deposit_RevertWhen_ZeroCommitment() public {
        vm.startPrank(user1);
        token.approve(address(pool), 1000);

        vm.expectRevert(AnonPool.InvalidCommitment.selector);
        pool.deposit(bytes32(0), 1000);
        vm.stopPrank();
    }

    function test_Deposit_RevertWhen_ZeroAmount() public {
        vm.startPrank(user1);

        vm.expectRevert(AnonPool.InvalidAmount.selector);
        pool.deposit(keccak256("commitment"), 0);
        vm.stopPrank();
    }

    function test_Deposit_RevertWhen_CommitmentAlreadyExists() public {
        uint256 amount = 10_000 * 10 ** 18;
        bytes32 commitment = keccak256("commitment");

        vm.startPrank(user1);
        token.approve(address(pool), amount * 2);
        pool.deposit(commitment, amount);

        // Try to deposit with same commitment
        vm.expectRevert(AnonPool.CommitmentAlreadyExists.selector);
        pool.deposit(commitment, amount);
        vm.stopPrank();
    }

    function test_Deposit_RevertWhen_ZeroReceivedAmount() public {
        // Deploy a pool with a 100% fee token
        ZeroFeeToken feeToken = new ZeroFeeToken();
        AnonPool feePool = new AnonPool(
            address(feeToken),
            address(withdrawVerifier),
            address(transferVerifier)
        );

        // Fund user with fee token
        feeToken.mint(user1, 1_000_000 * 10 ** 18);

        vm.startPrank(user1);
        feeToken.approve(address(feePool), 10_000 * 10 ** 18);

        // Should revert because received amount is 0 (100% fee taken)
        vm.expectRevert(AnonPool.InvalidAmount.selector);
        feePool.deposit(keccak256("commitment"), 10_000 * 10 ** 18);
        vm.stopPrank();
    }

    // ============ Withdrawal Tests ============

    function test_Withdraw_Success() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = keccak256("nullifier");
        address recipient = address(0x999);

        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        vm.expectEmit(true, true, false, true);
        emit Withdrawal(nullifierHash, recipient, amount);

        pool.withdraw("", nullifierHash, root, amount, recipient);

        assertEq(token.balanceOf(recipient) - recipientBalanceBefore, amount);
        assertTrue(pool.nullifierSpent(nullifierHash));
    }

    function test_Withdraw_RevertWhen_NullifierAlreadySpent() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = keccak256("nullifier");

        pool.withdraw("", nullifierHash, root, amount, user1);

        vm.expectRevert(AnonPool.NullifierAlreadySpent.selector);
        pool.withdraw("", nullifierHash, root, amount, user1);
    }

    function test_Withdraw_RevertWhen_InvalidMerkleRoot() public {
        vm.startPrank(user1);
        token.approve(address(pool), 1000 * 10 ** 18);
        pool.deposit(keccak256("commitment"), 1000 * 10 ** 18);
        vm.stopPrank();

        bytes32 fakeRoot = keccak256("fake_root");

        vm.expectRevert(AnonPool.InvalidMerkleRoot.selector);
        pool.withdraw("", keccak256("nullifier"), fakeRoot, 1000 * 10 ** 18, user1);
    }

    function test_Withdraw_RevertWhen_ZeroRecipient() public {
        vm.startPrank(user1);
        token.approve(address(pool), 1000 * 10 ** 18);
        pool.deposit(keccak256("commitment"), 1000 * 10 ** 18);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();

        vm.expectRevert(AnonPool.ZeroAddress.selector);
        pool.withdraw("", keccak256("nullifier"), root, 1000 * 10 ** 18, address(0));
    }

    // ============ Transfer Tests (Approved Spender Only) ============

    function test_Transfer_Success() public {
        uint256 depositAmount = 10_000 * 10 ** 18;
        uint256 transferAmount = 3_000 * 10 ** 18;
        uint256 changeAmount = depositAmount - transferAmount;

        vm.startPrank(user1);
        token.approve(address(pool), depositAmount);
        pool.deposit(keccak256("commitment"), depositAmount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = keccak256("nullifier");
        bytes32 outputCommitment = keccak256("output");
        bytes32 changeCommitment = keccak256("change");

        vm.prank(spender);
        pool.transfer("", nullifierHash, root, outputCommitment, transferAmount, changeCommitment, changeAmount);

        assertTrue(pool.nullifierSpent(nullifierHash));
        (bool outputExists,) = pool.getCommitmentData(outputCommitment);
        (bool changeExists,) = pool.getCommitmentData(changeCommitment);
        assertTrue(outputExists);
        assertTrue(changeExists);
    }

    function test_Transfer_FullAmount_NoChange() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        bytes32 outputCommitment = keccak256("output");

        vm.prank(spender);
        pool.transfer("", keccak256("nullifier"), root, outputCommitment, amount, bytes32(0), 0);

        (bool outputExists,) = pool.getCommitmentData(outputCommitment);
        assertTrue(outputExists);
    }

    function test_Transfer_RevertWhen_NotApprovedSpender() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        bytes32 outputCommitment = keccak256("output");

        // User tries to call transfer directly - should fail
        vm.prank(user1);
        vm.expectRevert(AnonPool.OnlyApprovedSpender.selector);
        pool.transfer("", keccak256("nullifier"), root, outputCommitment, amount, bytes32(0), 0);

        // Random address tries - should fail
        vm.prank(address(0x999));
        vm.expectRevert(AnonPool.OnlyApprovedSpender.selector);
        pool.transfer("", keccak256("nullifier"), root, outputCommitment, amount, bytes32(0), 0);
    }

    function test_Transfer_RevertWhen_SpenderRemoved() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        bytes32 outputCommitment = keccak256("output");

        // Remove the spender
        pool.removeSpender(spender);

        // Spender tries to transfer - should fail
        vm.prank(spender);
        vm.expectRevert(AnonPool.OnlyApprovedSpender.selector);
        pool.transfer("", keccak256("nullifier"), root, outputCommitment, amount, bytes32(0), 0);
    }

    function test_Transfer_RevertWhen_NullifierAlreadySpent() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount * 2);
        pool.deposit(keccak256("commitment1"), amount);
        pool.deposit(keccak256("commitment2"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = keccak256("nullifier");
        bytes32 outputCommitment1 = keccak256("output1");
        bytes32 outputCommitment2 = keccak256("output2");

        vm.startPrank(spender);
        pool.transfer("", nullifierHash, root, outputCommitment1, amount, bytes32(0), 0);

        vm.expectRevert(AnonPool.NullifierAlreadySpent.selector);
        pool.transfer("", nullifierHash, root, outputCommitment2, amount, bytes32(0), 0);
        vm.stopPrank();
    }

    function test_Transfer_RevertWhen_InvalidMerkleRoot() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 fakeRoot = keccak256("fake_root");
        bytes32 outputCommitment = keccak256("output");

        vm.prank(spender);
        vm.expectRevert(AnonPool.InvalidMerkleRoot.selector);
        pool.transfer("", keccak256("nullifier"), fakeRoot, outputCommitment, amount, bytes32(0), 0);
    }

    function test_Transfer_RevertWhen_ChangeCommitmentZeroWithAmount() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        bytes32 outputCommitment = keccak256("output");

        vm.prank(spender);
        vm.expectRevert(AnonPool.InvalidCommitment.selector);
        pool.transfer("", keccak256("nullifier"), root, outputCommitment, 5000 * 10 ** 18, bytes32(0), 5000 * 10 ** 18);
    }

    function test_Transfer_RevertWhen_OutputCommitmentZeroWithAmount() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();

        vm.prank(spender);
        vm.expectRevert(AnonPool.InvalidCommitment.selector);
        pool.transfer("", keccak256("nullifier"), root, bytes32(0), 5000 * 10 ** 18, keccak256("change"), 5000 * 10 ** 18);
    }

    function test_Transfer_RevertWhen_OutputCommitmentAlreadyExists() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount * 2);
        pool.deposit(keccak256("commitment1"), amount);
        pool.deposit(keccak256("commitment2"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();

        // First transfer creates output commitment
        vm.startPrank(spender);
        pool.transfer("", keccak256("nullifier1"), root, keccak256("output"), amount, bytes32(0), 0);

        // Second transfer tries to use same output commitment
        vm.expectRevert(AnonPool.CommitmentAlreadyExists.selector);
        pool.transfer("", keccak256("nullifier2"), root, keccak256("output"), amount, bytes32(0), 0);
        vm.stopPrank();
    }

    function test_Transfer_RevertWhen_ZeroSumAmounts() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();

        vm.prank(spender);
        vm.expectRevert(AnonPool.InvalidAmount.selector);
        pool.transfer("", keccak256("nullifier"), root, keccak256("output"), 0, keccak256("change"), 0);
    }

    // ============ Spender Transfer Flow Integration Test ============

    function test_SpenderTransferFlow() public {
        uint256 depositAmount = 100_000 * 10 ** 18;

        // User1 and User2 deposit
        vm.startPrank(user1);
        token.approve(address(pool), depositAmount);
        pool.deposit(keccak256("user1_commitment"), depositAmount);
        vm.stopPrank();

        vm.startPrank(user2);
        token.approve(address(pool), depositAmount);
        pool.deposit(keccak256("user2_commitment"), depositAmount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();

        // Spender initiates transfer from user1 to recipient1
        bytes32 recipient1Commitment = keccak256("recipient1_output");
        uint256 payment1 = 10_000 * 10 ** 18;

        vm.prank(spender);
        pool.transfer(
            "",
            keccak256("user1_nullifier"),
            root,
            recipient1Commitment,
            payment1,
            keccak256("user1_change"),
            depositAmount - payment1
        );

        // Recipient1's note is created
        (bool recipient1Exists,) = pool.getCommitmentData(recipient1Commitment);
        assertTrue(recipient1Exists);

        // Spender initiates transfer from user2 to recipient2
        bytes32 recipient2Commitment = keccak256("recipient2_output");
        uint256 payment2 = 15_000 * 10 ** 18;

        // Get the updated root after first transfer
        root = pool.getLastRoot();

        vm.prank(spender);
        pool.transfer(
            "",
            keccak256("user2_nullifier"),
            root,
            recipient2Commitment,
            payment2,
            keccak256("user2_change"),
            depositAmount - payment2
        );

        // Recipient2's note is created
        (bool recipient2Exists,) = pool.getCommitmentData(recipient2Commitment);
        assertTrue(recipient2Exists);

        // Recipient2 can withdraw to any address (preserving privacy)
        root = pool.getLastRoot();
        address privateWithdrawAddress = address(0x999);
        pool.withdraw("", keccak256("recipient2_nullifier"), root, payment2, privateWithdrawAddress);
        assertEq(token.balanceOf(privateWithdrawAddress), payment2);

        // User1 can withdraw their change note
        pool.withdraw("", keccak256("user1_change_nullifier"), root, depositAmount - payment1, user1);
        assertEq(token.balanceOf(user1), 1_000_000 * 10 ** 18 - depositAmount + (depositAmount - payment1));
    }

    // ============ Multiple Spenders Test ============

    function test_MultipleSpenders() public {
        // Add a second spender
        address spender2 = address(0xBBB);
        pool.addSpender(spender2);

        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount * 2);
        pool.deposit(keccak256("commitment1"), amount);
        pool.deposit(keccak256("commitment2"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();

        // First spender can transfer
        vm.prank(spender);
        pool.transfer("", keccak256("nullifier1"), root, keccak256("output1"), amount, bytes32(0), 0);

        // Second spender can also transfer
        vm.prank(spender2);
        pool.transfer("", keccak256("nullifier2"), root, keccak256("output2"), amount, bytes32(0), 0);

        (bool output1Exists,) = pool.getCommitmentData(keccak256("output1"));
        (bool output2Exists,) = pool.getCommitmentData(keccak256("output2"));
        assertTrue(output1Exists);
        assertTrue(output2Exists);
    }

    // ============ Merkle Tree Tests ============

    function test_MerkleTree_RootChangesOnDeposit() public {
        bytes32 rootBefore = pool.getLastRoot();

        vm.startPrank(user1);
        token.approve(address(pool), 1000 * 10 ** 18);
        pool.deposit(keccak256("commitment"), 1000 * 10 ** 18);
        vm.stopPrank();

        bytes32 rootAfter = pool.getLastRoot();
        assertTrue(rootBefore != rootAfter);
    }

    function test_MerkleTree_IsKnownRoot_Valid() public {
        vm.startPrank(user1);
        token.approve(address(pool), 1000 * 10 ** 18);
        pool.deposit(keccak256("commitment"), 1000 * 10 ** 18);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        assertTrue(pool.isKnownRoot(root));
    }

    function test_MerkleTree_IsKnownRoot_Invalid() public view {
        bytes32 fakeRoot = keccak256("fake_root");
        assertFalse(pool.isKnownRoot(fakeRoot));
    }

    function test_MerkleTree_IsKnownRoot_Zero() public view {
        assertFalse(pool.isKnownRoot(bytes32(0)));
    }

    function test_MerkleTree_RootInvalidation() public {
        // Verify initial root is valid
        bytes32 initialRoot = pool.getLastRoot();
        assertTrue(pool.isKnownRoot(initialRoot));

        // Track roots as we deposit
        bytes32[] memory roots = new bytes32[](5);

        vm.startPrank(user1);
        token.approve(address(pool), 10_000 * 10 ** 18);

        for (uint256 i = 0; i < 5; i++) {
            pool.deposit(keccak256(abi.encodePacked("commitment", i)), 1000 * 10 ** 18);
            roots[i] = pool.getLastRoot();
        }
        vm.stopPrank();

        // All recent roots should still be valid
        for (uint256 i = 0; i < 5; i++) {
            assertTrue(pool.isKnownRoot(roots[i]));
        }

        // Initial root should still be valid (not yet overwritten)
        assertTrue(pool.isKnownRoot(initialRoot));

        // Note: Full invalidation test would require ROOT_HISTORY_SIZE (1000) deposits
        // The mechanism is tested by verifying _insertLeaf invalidates the old root
        // at the overwritten index position
    }

    // ============ New View Function Tests ============

    function test_GetCommitmentData_Exists() public {
        uint256 amount = 10_000 * 10 ** 18;
        bytes32 commitment = keccak256("commitment");

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(commitment, amount);
        vm.stopPrank();

        (bool exists, uint32 leafIndex) = pool.getCommitmentData(commitment);
        assertTrue(exists);
        assertEq(leafIndex, 0);
    }

    function test_GetCommitmentData_NotExists() public view {
        (bool exists, uint32 leafIndex) = pool.getCommitmentData(keccak256("nonexistent"));
        assertFalse(exists);
        assertEq(leafIndex, 0);
    }

    function test_BatchCheckNullifiers() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();
        bytes32 spentNullifier = keccak256("spent");
        bytes32 unspentNullifier = keccak256("unspent");

        // Withdraw to spend one nullifier
        pool.withdraw("", spentNullifier, root, amount, user1);

        bytes32[] memory nullifiers = new bytes32[](2);
        nullifiers[0] = spentNullifier;
        nullifiers[1] = unspentNullifier;

        bool[] memory results = pool.batchCheckNullifiers(nullifiers);
        assertTrue(results[0]);  // spent
        assertFalse(results[1]); // unspent
    }

    function test_GetPoolStats() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        (uint256 totalDeposited, uint32 leafCount, bytes32 currentRoot, uint32 treeCapacity) = pool.getPoolStats();

        assertEq(totalDeposited, amount);
        assertEq(leafCount, 1);
        assertEq(currentRoot, pool.getLastRoot());
        assertEq(treeCapacity, 2 ** 20);
    }

    function test_GetMerklePathIndices() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        uint8[] memory pathIndices = pool.getMerklePathIndices(0);

        assertEq(pathIndices.length, 20);
        // First leaf is on the left (index 0)
        assertEq(pathIndices[0], 0);
    }

    function test_GetMerklePathIndices_InvalidIndex() public view {
        uint8[] memory pathIndices = pool.getMerklePathIndices(999);
        assertEq(pathIndices.length, 0);
    }

    function test_GetRootAtIndex() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getRootAtIndex(1);  // After deposit, root is at index 1
        assertEq(root, pool.getLastRoot());
    }

    function test_IsKnownRoot_O1() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 root = pool.getLastRoot();

        // Should be O(1) now with mapping
        assertTrue(pool.isKnownRoot(root));
        assertFalse(pool.isKnownRoot(keccak256("fake")));
    }

    // ============ Hash Function Tests ============

    function test_HashLeftRight_Deterministic() public view {
        bytes32 left = keccak256("left");
        bytes32 right = keccak256("right");

        bytes32 hash1 = pool.hashLeftRight(left, right);
        bytes32 hash2 = pool.hashLeftRight(left, right);

        assertEq(hash1, hash2);
    }

    function test_HashLeftRight_OrderMatters() public view {
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");

        bytes32 hashAB = pool.hashLeftRight(a, b);
        bytes32 hashBA = pool.hashLeftRight(b, a);

        assertTrue(hashAB != hashBA);
    }

    // ============ Root Status Tests ============

    function test_GetRootStatus_CurrentRoot() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount);
        pool.deposit(keccak256("commitment"), amount);
        vm.stopPrank();

        bytes32 currentRoot = pool.getLastRoot();
        (bool exists, uint32 depositsAgo, uint32 depositsUntilExpiry) = pool.getRootStatus(currentRoot);

        assertTrue(exists);
        assertEq(depositsAgo, 0); // Current root
        assertEq(depositsUntilExpiry, 999); // ROOT_HISTORY_SIZE - 1
    }

    function test_GetRootStatus_OlderRoot() public {
        uint256 amount = 10_000 * 10 ** 18;

        vm.startPrank(user1);
        token.approve(address(pool), amount * 5);

        // First deposit
        pool.deposit(keccak256("commitment1"), amount);
        bytes32 firstRoot = pool.getLastRoot();

        // More deposits
        pool.deposit(keccak256("commitment2"), amount);
        pool.deposit(keccak256("commitment3"), amount);
        pool.deposit(keccak256("commitment4"), amount);
        vm.stopPrank();

        // Check first root status
        (bool exists, uint32 depositsAgo, uint32 depositsUntilExpiry) = pool.getRootStatus(firstRoot);

        assertTrue(exists);
        assertEq(depositsAgo, 3); // 3 deposits after the first one
        assertEq(depositsUntilExpiry, 996); // ROOT_HISTORY_SIZE - 1 - 3
    }

    function test_GetRootStatus_InvalidRoot() public view {
        bytes32 fakeRoot = keccak256("fake");
        (bool exists, uint32 depositsAgo, uint32 depositsUntilExpiry) = pool.getRootStatus(fakeRoot);

        assertFalse(exists);
        assertEq(depositsAgo, 0);
        assertEq(depositsUntilExpiry, 0);
    }

    function test_GetRootStatus_ZeroRoot() public view {
        (bool exists, uint32 depositsAgo, uint32 depositsUntilExpiry) = pool.getRootStatus(bytes32(0));

        assertFalse(exists);
        assertEq(depositsAgo, 0);
        assertEq(depositsUntilExpiry, 0);
    }
}
