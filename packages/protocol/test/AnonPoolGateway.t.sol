// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AnonPoolGateway} from "../contracts/AnonPoolGateway.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Simple test token for unit tests
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}

/// @dev Mock AnonPool for testing
contract MockAnonPool {
    mapping(bytes32 => uint256) public deposits;

    function deposit(bytes32 commitment, uint256 amount) external {
        deposits[commitment] = amount;
    }
}

/// @dev Mock SwapRouter - simulates Uniswap V3 behavior
contract MockSwapRouter {
    MockERC20 public outputToken;

    constructor(address _outputToken) {
        outputToken = MockERC20(_outputToken);
    }

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        // Simulate swap: just mint output tokens to recipient (1:1 ratio)
        amountOut = params.amountIn;
        outputToken.mint(params.recipient, amountOut);
    }

    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        returns (uint256 amountIn)
    {
        // Simulate swap: mint exact output tokens, return amountOut as amountIn (1:1)
        // Keep any excess ETH (will be retrieved via refundETH)
        amountIn = params.amountOut;
        outputToken.mint(params.recipient, params.amountOut);
    }

    /// @notice Refund any ETH held by router to caller
    function refundETH() external payable {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = msg.sender.call{value: balance}("");
            require(success, "ETH refund failed");
        }
    }

    // Allow receiving ETH
    receive() external payable {}
}

contract AnonPoolGatewayTest is Test {
    AnonPoolGateway public gateway;
    MockAnonPool public anonPool;
    MockERC20 public anon;
    MockERC20 public usdc;
    address public weth;
    MockSwapRouter public swapRouter;

    address public owner = address(this);
    address public user = address(0x1234);

    function setUp() public {
        // Deploy mocks
        anonPool = new MockAnonPool();
        anon = new MockERC20("ANON", "ANON", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        weth = address(0x4200000000000000000000000000000000000006);

        // Deploy mock swap router
        swapRouter = new MockSwapRouter(address(anon));

        // Deploy gateway
        gateway = new AnonPoolGateway(
            address(swapRouter),
            address(anonPool),
            address(anon),
            weth,
            address(usdc)
        );
    }

    // ============ Constructor Tests ============

    function test_Constructor_SetsCorrectValues() public view {
        assertEq(address(gateway.swapRouter()), address(swapRouter));
        assertEq(address(gateway.anonPool()), address(anonPool));
        assertEq(address(gateway.anon()), address(anon));
        assertEq(gateway.weth(), weth);
        assertEq(address(gateway.usdc()), address(usdc));
        assertEq(gateway.owner(), owner);
    }

    function test_Constructor_RevertsOnZeroSwapRouter() public {
        vm.expectRevert(AnonPoolGateway.ZeroAddress.selector);
        new AnonPoolGateway(
            address(0),
            address(anonPool),
            address(anon),
            weth,
            address(usdc)
        );
    }

    function test_Constructor_RevertsOnZeroAnonPool() public {
        vm.expectRevert(AnonPoolGateway.ZeroAddress.selector);
        new AnonPoolGateway(
            address(swapRouter),
            address(0),
            address(anon),
            weth,
            address(usdc)
        );
    }

    function test_Constructor_RevertsOnZeroAnon() public {
        vm.expectRevert(AnonPoolGateway.ZeroAddress.selector);
        new AnonPoolGateway(
            address(swapRouter),
            address(anonPool),
            address(0),
            weth,
            address(usdc)
        );
    }

    function test_Constructor_RevertsOnZeroWeth() public {
        vm.expectRevert(AnonPoolGateway.ZeroAddress.selector);
        new AnonPoolGateway(
            address(swapRouter),
            address(anonPool),
            address(anon),
            address(0),
            address(usdc)
        );
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(AnonPoolGateway.ZeroAddress.selector);
        new AnonPoolGateway(
            address(swapRouter),
            address(anonPool),
            address(anon),
            weth,
            address(0)
        );
    }

    function test_Constructor_RevertsOnEOASwapRouter() public {
        vm.expectRevert(AnonPoolGateway.InvalidContract.selector);
        new AnonPoolGateway(
            address(0xdead), // EOA, not a contract
            address(anonPool),
            address(anon),
            weth,
            address(usdc)
        );
    }

    function test_Constructor_RevertsOnEOAAnonPool() public {
        vm.expectRevert(AnonPoolGateway.InvalidContract.selector);
        new AnonPoolGateway(
            address(swapRouter),
            address(0xdead), // EOA, not a contract
            address(anon),
            weth,
            address(usdc)
        );
    }

    function test_Constructor_RevertsOnEOAAnon() public {
        vm.expectRevert(AnonPoolGateway.InvalidContract.selector);
        new AnonPoolGateway(
            address(swapRouter),
            address(anonPool),
            address(0xdead), // EOA, not a contract
            weth,
            address(usdc)
        );
    }

    function test_Constructor_RevertsOnEOAUsdc() public {
        vm.expectRevert(AnonPoolGateway.InvalidContract.selector);
        new AnonPoolGateway(
            address(swapRouter),
            address(anonPool),
            address(anon),
            weth,
            address(0xdead) // EOA, not a contract
        );
    }

    // ============ Slippage Protection Tests ============

    function test_DepositWithETH_RevertsOnZeroMinAmount() public {
        bytes32 commitment = keccak256("test");

        vm.expectRevert(AnonPoolGateway.SlippageProtectionRequired.selector);
        gateway.depositWithETH{value: 1 ether}(commitment, 0);
    }

    function test_DepositWithUSDC_RevertsOnZeroMinAmount() public {
        bytes32 commitment = keccak256("test");
        uint256 amountIn = 100e6; // 100 USDC

        // Mint and approve USDC
        usdc.mint(user, amountIn);
        vm.prank(user);
        usdc.approve(address(gateway), amountIn);

        vm.prank(user);
        vm.expectRevert(AnonPoolGateway.SlippageProtectionRequired.selector);
        gateway.depositWithUSDC(commitment, amountIn, 0);
    }

    function test_DepositWithETH_RevertsOnNoETH() public {
        bytes32 commitment = keccak256("test");

        vm.expectRevert(AnonPoolGateway.NoETHSent.selector);
        gateway.depositWithETH{value: 0}(commitment, 1 ether);
    }

    function test_DepositWithETH_RevertsOnZeroCommitment() public {
        vm.expectRevert(AnonPoolGateway.InvalidCommitment.selector);
        gateway.depositWithETH{value: 1 ether}(bytes32(0), 1 ether);
    }

    function test_DepositWithUSDC_RevertsOnZeroAmount() public {
        bytes32 commitment = keccak256("test");

        vm.expectRevert(AnonPoolGateway.InvalidAmount.selector);
        gateway.depositWithUSDC(commitment, 0, 1 ether);
    }

    function test_DepositWithUSDC_RevertsOnZeroCommitment() public {
        vm.expectRevert(AnonPoolGateway.InvalidCommitment.selector);
        gateway.depositWithUSDC(bytes32(0), 100e6, 1 ether);
    }

    function test_DepositExactWithETH_RevertsOnNoETH() public {
        bytes32 commitment = keccak256("test");

        vm.expectRevert(AnonPoolGateway.NoETHSent.selector);
        gateway.depositExactWithETH{value: 0}(commitment, 1 ether);
    }

    function test_DepositExactWithETH_RevertsOnZeroAmount() public {
        bytes32 commitment = keccak256("test");

        vm.expectRevert(AnonPoolGateway.InvalidAmount.selector);
        gateway.depositExactWithETH{value: 1 ether}(commitment, 0);
    }

    function test_DepositExactWithETH_RevertsOnZeroCommitment() public {
        vm.expectRevert(AnonPoolGateway.InvalidCommitment.selector);
        gateway.depositExactWithETH{value: 1 ether}(bytes32(0), 1 ether);
    }

    function test_DepositExactWithUSDC_RevertsOnZeroAmount() public {
        bytes32 commitment = keccak256("test");

        vm.expectRevert(AnonPoolGateway.InvalidAmount.selector);
        gateway.depositExactWithUSDC(commitment, 0, 100e6);
    }

    function test_DepositExactWithUSDC_RevertsOnZeroMaxAmount() public {
        bytes32 commitment = keccak256("test");

        vm.expectRevert(AnonPoolGateway.InvalidAmount.selector);
        gateway.depositExactWithUSDC(commitment, 1 ether, 0);
    }

    function test_DepositExactWithUSDC_RevertsOnZeroCommitment() public {
        vm.expectRevert(AnonPoolGateway.InvalidCommitment.selector);
        gateway.depositExactWithUSDC(bytes32(0), 1 ether, 100e6);
    }

    // ============ Emergency Withdraw Tests ============

    function test_EmergencyWithdraw_ERC20() public {
        // Give gateway some ANON tokens (simulating stuck tokens)
        uint256 stuckAmount = 50 ether;
        anon.mint(address(gateway), stuckAmount);

        uint256 ownerBalanceBefore = anon.balanceOf(owner);

        // Emergency withdraw
        gateway.emergencyWithdraw(address(anon), stuckAmount);

        assertEq(anon.balanceOf(owner), ownerBalanceBefore + stuckAmount);
    }

    function test_EmergencyWithdraw_ETH() public {
        // Send some ETH to the gateway
        uint256 stuckAmount = 1 ether;
        vm.deal(address(gateway), stuckAmount);

        uint256 ownerBalanceBefore = owner.balance;

        // Emergency withdraw
        gateway.emergencyWithdraw(address(0), stuckAmount);

        assertEq(owner.balance, ownerBalanceBefore + stuckAmount);
    }

    function test_EmergencyWithdraw_RevertsOnNonOwner() public {
        anon.mint(address(gateway), 1 ether);

        vm.prank(user);
        vm.expectRevert();
        gateway.emergencyWithdraw(address(anon), 1 ether);
    }

    function test_EmergencyWithdraw_EmitsEvent() public {
        uint256 amount = 1 ether;
        anon.mint(address(gateway), amount);

        vm.expectEmit(true, true, false, true);
        emit AnonPoolGateway.EmergencyWithdraw(address(anon), owner, amount);

        gateway.emergencyWithdraw(address(anon), amount);
    }

    // ============ Ownable2Step Tests ============

    function test_TransferOwnership_RequiresAcceptance() public {
        // Start transfer
        gateway.transferOwnership(user);

        // Owner is still the original owner until accepted
        assertEq(gateway.owner(), owner);

        // Accept transfer
        vm.prank(user);
        gateway.acceptOwnership();

        // Now user is the owner
        assertEq(gateway.owner(), user);
    }

    function test_TransferOwnership_CannotAcceptWithoutPending() public {
        vm.prank(user);
        vm.expectRevert();
        gateway.acceptOwnership();
    }

    function test_PendingOwnerCanBeChanged() public {
        // Start transfer to user
        gateway.transferOwnership(user);

        // Change pending owner to someone else
        address anotherUser = address(0x5678);
        gateway.transferOwnership(anotherUser);

        // User can no longer accept
        vm.prank(user);
        vm.expectRevert();
        gateway.acceptOwnership();

        // But anotherUser can
        vm.prank(anotherUser);
        gateway.acceptOwnership();

        assertEq(gateway.owner(), anotherUser);
    }

    // ============ Receive ETH Test ============

    function test_ReceiveETH() public {
        vm.deal(user, 1 ether);

        vm.prank(user);
        (bool success, ) = address(gateway).call{value: 1 ether}("");

        assertTrue(success);
        assertEq(address(gateway).balance, 1 ether);
    }

    // ============ Pool Fee Test ============

    function test_PoolFee() public view {
        assertEq(gateway.POOL_FEE(), 10000); // 1%
    }

    // Receive ETH for tests
    receive() external payable {}
}
