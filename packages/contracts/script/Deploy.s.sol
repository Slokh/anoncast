// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AnonPool} from "../src/AnonPool.sol";
import {AuctionSpender} from "../src/AuctionSpender.sol";
import {WithdrawVerifier} from "../src/verifiers/WithdrawVerifier.sol";
import {TransferVerifier} from "../src/verifiers/TransferVerifier.sol";

/// @title DeployTestnet
/// @notice Deploys pool and verifiers to testnet
/// @dev Requires TOKEN_ADDRESS env var for the ERC20 token to use
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");
        address spender = vm.envAddress("SPENDER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy verifiers
        WithdrawVerifier withdrawVerifier = new WithdrawVerifier();
        TransferVerifier transferVerifier = new TransferVerifier();
        console.log("WithdrawVerifier:", address(withdrawVerifier));
        console.log("TransferVerifier:", address(transferVerifier));

        // Deploy pool
        AnonPool pool = new AnonPool(
            tokenAddress,
            address(withdrawVerifier),
            address(transferVerifier)
        );
        console.log("AnonPool:", address(pool));

        // Add server wallet as approved spender
        pool.addSpender(spender);
        console.log("Spender added:", spender);

        vm.stopBroadcast();

        // Output for easy copy-paste to .env
        console.log("\n=== Add to .env.local ===");
        console.log("NEXT_PUBLIC_POOL_CONTRACT=%s", address(pool));
    }
}

/// @title DeployMainnet
/// @notice Deploys pool and verifiers to mainnet (uses existing $ANON token)
contract DeployMainnet is Script {
    // Real $ANON token on Base mainnet
    address constant ANON_TOKEN = 0x0Db510e79909666d6dEc7f5e49370838c16D950f;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address spender = vm.envAddress("SPENDER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy verifiers
        WithdrawVerifier withdrawVerifier = new WithdrawVerifier();
        TransferVerifier transferVerifier = new TransferVerifier();
        console.log("WithdrawVerifier:", address(withdrawVerifier));
        console.log("TransferVerifier:", address(transferVerifier));

        // Deploy pool
        AnonPool pool = new AnonPool(
            ANON_TOKEN,
            address(withdrawVerifier),
            address(transferVerifier)
        );
        console.log("AnonPool:", address(pool));

        // Add server wallet as approved spender
        pool.addSpender(spender);
        console.log("Spender added:", spender);

        vm.stopBroadcast();

        console.log("\n=== Add to .env ===");
        console.log("NEXT_PUBLIC_POOL_CONTRACT=%s", address(pool));
    }
}

/// @title DeployAuctionSpender
/// @notice Deploys AuctionSpender for an existing AnonPool
/// @dev Requires ANON_POOL address (deploy pool first)
contract DeployAuctionSpender is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address anonPool = vm.envAddress("ANON_POOL");
        address operator = vm.envAddress("AUCTION_OPERATOR");

        // Configuration - can be overridden via env vars
        uint256 slotStartTime = vm.envUint("SLOT_START_TIME"); // Required: when slot 0 starts
        uint256 settlementWindowStart = vm.envOr("SETTLEMENT_WINDOW_START", uint256(0));
        uint256 settlementWindowEnd = vm.envOr("SETTLEMENT_WINDOW_END", uint256(300)); // 5 minutes

        vm.startBroadcast(deployerPrivateKey);

        // Deploy AuctionSpender
        AuctionSpender auctionSpender = new AuctionSpender(
            anonPool,
            operator,
            slotStartTime,
            settlementWindowStart,
            settlementWindowEnd
        );
        console.log("AuctionSpender deployed to:", address(auctionSpender));

        // Add AuctionSpender as approved spender on AnonPool
        AnonPool(anonPool).addSpender(address(auctionSpender));
        console.log("AuctionSpender added as approved spender on AnonPool");

        vm.stopBroadcast();

        console.log("\n=== Configuration ===");
        console.log("AnonPool:", anonPool);
        console.log("Operator:", operator);
        console.log("Slot Start Time:", slotStartTime);
        console.log("Settlement Window: [%s, %s] seconds after slot end", settlementWindowStart, settlementWindowEnd);

        console.log("\n=== Add to .env ===");
        console.log("AUCTION_SPENDER_CONTRACT=%s", address(auctionSpender));
    }
}

/// @title DeployFullStack
/// @notice Deploys complete stack: Verifiers, AnonPool, and AuctionSpender
/// @dev For production deployments with full auction functionality
contract DeployFullStack is Script {
    // Real $ANON token on Base mainnet
    address constant ANON_TOKEN = 0x0Db510e79909666d6dEc7f5e49370838c16D950f;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address auctionOperator = vm.envAddress("AUCTION_OPERATOR");

        // Configuration
        uint256 slotStartTime = vm.envUint("SLOT_START_TIME"); // Required: when slot 0 starts
        uint256 settlementWindowStart = vm.envOr("SETTLEMENT_WINDOW_START", uint256(0));
        uint256 settlementWindowEnd = vm.envOr("SETTLEMENT_WINDOW_END", uint256(300)); // 5 minutes

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy verifiers
        WithdrawVerifier withdrawVerifier = new WithdrawVerifier();
        TransferVerifier transferVerifier = new TransferVerifier();
        console.log("WithdrawVerifier:", address(withdrawVerifier));
        console.log("TransferVerifier:", address(transferVerifier));

        // 2. Deploy pool
        AnonPool pool = new AnonPool(
            ANON_TOKEN,
            address(withdrawVerifier),
            address(transferVerifier)
        );
        console.log("AnonPool:", address(pool));

        // 3. Deploy AuctionSpender
        AuctionSpender auctionSpender = new AuctionSpender(
            address(pool),
            auctionOperator,
            slotStartTime,
            settlementWindowStart,
            settlementWindowEnd
        );
        console.log("AuctionSpender:", address(auctionSpender));

        // 4. Add AuctionSpender as approved spender
        pool.addSpender(address(auctionSpender));
        console.log("AuctionSpender added as approved spender");

        vm.stopBroadcast();

        console.log("\n=== Add to .env ===");
        console.log("NEXT_PUBLIC_POOL_CONTRACT=%s", address(pool));
        console.log("NEXT_PUBLIC_AUCTION_CONTRACT=%s", address(auctionSpender));
    }
}
