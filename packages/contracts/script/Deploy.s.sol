// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TestANON} from "../src/TestANON.sol";
import {AnonPool} from "../src/AnonPool.sol";
import {AuctionSpender} from "../src/AuctionSpender.sol";

/// @title DeployTestnet
/// @notice Deploys core contracts to testnet
/// @dev Requires WITHDRAW_VERIFIER and TRANSFER_VERIFIER addresses (deploy ZK verifiers first)
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address withdrawVerifier = vm.envAddress("WITHDRAW_VERIFIER");
        address transferVerifier = vm.envAddress("TRANSFER_VERIFIER");
        address spender = vm.envAddress("SPENDER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy test token
        TestANON testToken = new TestANON();
        console.log("TestANON deployed to:", address(testToken));

        // Deploy pool
        AnonPool pool = new AnonPool(
            address(testToken),
            withdrawVerifier,
            transferVerifier
        );
        console.log("AnonPool deployed to:", address(pool));

        // Add server wallet as approved spender
        pool.addSpender(spender);
        console.log("Spender added:", spender);

        vm.stopBroadcast();

        // Output for easy copy-paste to .env
        console.log("\n=== Add to .env.local ===");
        console.log("NEXT_PUBLIC_TESTNET_ANON_TOKEN=%s", address(testToken));
        console.log("NEXT_PUBLIC_ANON_POOL_CONTRACT=%s", address(pool));
    }
}

/// @title DeployMainnet
/// @notice Deploys pool to mainnet (uses existing $ANON token)
contract DeployMainnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address anonToken = vm.envAddress("ANON_TOKEN");
        address withdrawVerifier = vm.envAddress("WITHDRAW_VERIFIER");
        address transferVerifier = vm.envAddress("TRANSFER_VERIFIER");
        address spender = vm.envAddress("SPENDER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy pool
        AnonPool pool = new AnonPool(
            anonToken,
            withdrawVerifier,
            transferVerifier
        );
        console.log("AnonPool deployed to:", address(pool));

        // Add server wallet as approved spender
        pool.addSpender(spender);
        console.log("Spender added:", spender);

        vm.stopBroadcast();

        console.log("\n=== Add to .env ===");
        console.log("NEXT_PUBLIC_ANON_POOL_CONTRACT=%s", address(pool));
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
/// @notice Deploys complete stack: TestToken, AnonPool, and AuctionSpender
/// @dev For testnet deployments with full auction functionality
contract DeployFullStack is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address withdrawVerifier = vm.envAddress("WITHDRAW_VERIFIER");
        address transferVerifier = vm.envAddress("TRANSFER_VERIFIER");
        address auctionOperator = vm.envAddress("AUCTION_OPERATOR");

        // Configuration
        uint256 slotStartTime = vm.envUint("SLOT_START_TIME"); // Required: when slot 0 starts
        uint256 settlementWindowStart = vm.envOr("SETTLEMENT_WINDOW_START", uint256(0));
        uint256 settlementWindowEnd = vm.envOr("SETTLEMENT_WINDOW_END", uint256(300)); // 5 minutes

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy test token
        TestANON testToken = new TestANON();
        console.log("TestANON deployed to:", address(testToken));

        // 2. Deploy pool
        AnonPool pool = new AnonPool(
            address(testToken),
            withdrawVerifier,
            transferVerifier
        );
        console.log("AnonPool deployed to:", address(pool));

        // 3. Deploy AuctionSpender
        AuctionSpender auctionSpender = new AuctionSpender(
            address(pool),
            auctionOperator,
            slotStartTime,
            settlementWindowStart,
            settlementWindowEnd
        );
        console.log("AuctionSpender deployed to:", address(auctionSpender));

        // 4. Add AuctionSpender as approved spender
        pool.addSpender(address(auctionSpender));
        console.log("AuctionSpender added as approved spender");

        vm.stopBroadcast();

        console.log("\n=== Add to .env.local ===");
        console.log("NEXT_PUBLIC_TESTNET_ANON_TOKEN=%s", address(testToken));
        console.log("NEXT_PUBLIC_ANON_POOL_CONTRACT=%s", address(pool));
        console.log("AUCTION_SPENDER_CONTRACT=%s", address(auctionSpender));
    }
}
