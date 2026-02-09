// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title ISwapRouter
/// @notice Minimal interface for Uniswap V3 SwapRouter02
interface ISwapRouter {
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

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
    function exactOutputSingle(ExactOutputSingleParams calldata params) external payable returns (uint256 amountIn);

    /// @notice Refunds any ETH held by the router to msg.sender
    function refundETH() external payable;
}

/// @title IAnonPool
/// @notice Minimal interface for AnonPool deposit
interface IAnonPool {
    function deposit(bytes32 commitment, uint256 amount) external;
}

/// @title AnonPoolGateway
/// @notice Swap tokens and deposit into AnonPool in a single transaction
/// @dev Supports ETH and USDC as input tokens, swaps via Uniswap V3
contract AnonPoolGateway is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ============ Immutables ============

    ISwapRouter public immutable swapRouter;
    IAnonPool public immutable anonPool;
    IERC20 public immutable anon;
    address public immutable weth;
    IERC20 public immutable usdc;

    // ============ Constants ============

    /// @notice Pool fee for WETH/ANON and USDC/ANON pairs (1%)
    uint24 public constant POOL_FEE = 10000;

    // ============ Errors ============

    error NoETHSent();
    error InvalidAmount();
    error ETHRefundFailed();
    error InvalidCommitment();
    error ZeroAddress();
    error InvalidContract();
    error SlippageProtectionRequired();

    // ============ Events ============

    event SwapAndDeposit(
        address indexed sender,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 indexed commitment
    );

    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    // ============ Constructor ============

    constructor(
        address _swapRouter,
        address _anonPool,
        address _anon,
        address _weth,
        address _usdc
    ) Ownable(msg.sender) {
        // Validate all addresses are non-zero
        if (_swapRouter == address(0)) revert ZeroAddress();
        if (_anonPool == address(0)) revert ZeroAddress();
        if (_anon == address(0)) revert ZeroAddress();
        if (_weth == address(0)) revert ZeroAddress();
        if (_usdc == address(0)) revert ZeroAddress();

        // Verify critical addresses contain code (not EOAs)
        if (_swapRouter.code.length == 0) revert InvalidContract();
        if (_anonPool.code.length == 0) revert InvalidContract();
        if (_anon.code.length == 0) revert InvalidContract();
        // Note: WETH check skipped as it's used as address identifier for ETH swaps
        if (_usdc.code.length == 0) revert InvalidContract();

        swapRouter = ISwapRouter(_swapRouter);
        anonPool = IAnonPool(_anonPool);
        anon = IERC20(_anon);
        weth = _weth;
        usdc = IERC20(_usdc);

        // Approve ANON to pool (infinite approval for gas efficiency)
        anon.approve(_anonPool, type(uint256).max);

        // Approve USDC to swap router
        usdc.approve(_swapRouter, type(uint256).max);
    }

    // ============ Swap and Deposit Functions ============

    /// @notice Swap ETH for ANON and deposit into privacy pool
    /// @param commitment The deposit commitment (generated client-side)
    /// @param minAmountOut Minimum ANON to receive (slippage protection) - must be > 0
    function depositWithETH(
        bytes32 commitment,
        uint256 minAmountOut
    ) external payable nonReentrant {
        if (msg.value == 0) revert NoETHSent();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (minAmountOut == 0) revert SlippageProtectionRequired();

        // Swap ETH for ANON
        uint256 amountOut = swapRouter.exactInputSingle{value: msg.value}(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: weth,
                tokenOut: address(anon),
                fee: POOL_FEE,
                recipient: address(this),
                amountIn: msg.value,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        // Deposit ANON into privacy pool
        anonPool.deposit(commitment, amountOut);

        emit SwapAndDeposit(msg.sender, weth, msg.value, amountOut, commitment);
    }

    /// @notice Swap USDC for ANON and deposit into privacy pool
    /// @param commitment The deposit commitment (generated client-side)
    /// @param amountIn USDC amount to swap
    /// @param minAmountOut Minimum ANON to receive (slippage protection) - must be > 0
    function depositWithUSDC(
        bytes32 commitment,
        uint256 amountIn,
        uint256 minAmountOut
    ) external nonReentrant {
        if (amountIn == 0) revert InvalidAmount();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (minAmountOut == 0) revert SlippageProtectionRequired();

        // Pull USDC from sender
        usdc.safeTransferFrom(msg.sender, address(this), amountIn);

        // Swap USDC for ANON
        uint256 amountOut = swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: address(usdc),
                tokenOut: address(anon),
                fee: POOL_FEE,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        // Deposit ANON into privacy pool
        anonPool.deposit(commitment, amountOut);

        emit SwapAndDeposit(msg.sender, address(usdc), amountIn, amountOut, commitment);
    }

    /// @notice Swap exact ETH needed for specific ANON amount and deposit
    /// @dev Excess ETH is refunded to sender via router's refundETH
    /// @param commitment The deposit commitment (generated client-side)
    /// @param amountOut Exact ANON amount to receive and deposit
    function depositExactWithETH(
        bytes32 commitment,
        uint256 amountOut
    ) external payable nonReentrant {
        if (msg.value == 0) revert NoETHSent();
        if (amountOut == 0) revert InvalidAmount();
        if (commitment == bytes32(0)) revert InvalidCommitment();

        // Track balance before to calculate actual ETH used
        uint256 balanceBefore = address(this).balance - msg.value;

        // Swap exact output - router keeps unused ETH
        uint256 amountIn = swapRouter.exactOutputSingle{value: msg.value}(
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: weth,
                tokenOut: address(anon),
                fee: POOL_FEE,
                recipient: address(this),
                amountOut: amountOut,
                amountInMaximum: msg.value,
                sqrtPriceLimitX96: 0
            })
        );

        // Retrieve unused ETH from router (router sends it back to this contract)
        swapRouter.refundETH();

        // Refund excess ETH to user
        uint256 refundAmount = address(this).balance - balanceBefore;
        if (refundAmount > 0) {
            (bool success, ) = msg.sender.call{value: refundAmount}("");
            if (!success) revert ETHRefundFailed();
        }

        // Deposit ANON into privacy pool
        anonPool.deposit(commitment, amountOut);

        emit SwapAndDeposit(msg.sender, weth, amountIn, amountOut, commitment);
    }

    /// @notice Swap exact USDC needed for specific ANON amount and deposit
    /// @param commitment The deposit commitment (generated client-side)
    /// @param amountOut Exact ANON amount to receive and deposit
    /// @param maxAmountIn Maximum USDC to spend (slippage protection)
    function depositExactWithUSDC(
        bytes32 commitment,
        uint256 amountOut,
        uint256 maxAmountIn
    ) external nonReentrant {
        if (amountOut == 0) revert InvalidAmount();
        if (maxAmountIn == 0) revert InvalidAmount();
        if (commitment == bytes32(0)) revert InvalidCommitment();

        // Pull max USDC from sender
        usdc.safeTransferFrom(msg.sender, address(this), maxAmountIn);

        // Swap exact output
        uint256 amountIn = swapRouter.exactOutputSingle(
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: address(usdc),
                tokenOut: address(anon),
                fee: POOL_FEE,
                recipient: address(this),
                amountOut: amountOut,
                amountInMaximum: maxAmountIn,
                sqrtPriceLimitX96: 0
            })
        );

        // Refund excess USDC
        if (maxAmountIn > amountIn) {
            usdc.safeTransfer(msg.sender, maxAmountIn - amountIn);
        }

        // Deposit ANON into privacy pool
        anonPool.deposit(commitment, amountOut);

        emit SwapAndDeposit(msg.sender, address(usdc), amountIn, amountOut, commitment);
    }

    // ============ Admin Functions ============

    /// @notice Emergency withdrawal of tokens accidentally sent to this contract
    /// @dev This contract should not hold tokens normally - they flow through to AnonPool.
    ///      If a swap succeeds but deposit fails, tokens could be stuck here.
    /// @param token Token address to withdraw (address(0) for ETH)
    /// @param amount Amount to withdraw
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(owner()).call{value: amount}("");
            if (!success) revert ETHRefundFailed();
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
        emit EmergencyWithdraw(token, owner(), amount);
    }

    // ============ Receive ============

    /// @notice Accept ETH for swaps
    receive() external payable {}
}
