// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AnonPool} from "../contracts/AnonPool.sol";
import {AnonPoolAuctionSpender} from "../contracts/AnonPoolAuctionSpender.sol";
import {AnonPoolGateway} from "../contracts/AnonPoolGateway.sol";
import {WithdrawVerifier} from "../contracts/verifiers/WithdrawVerifier.sol";
import {TransferVerifier} from "../contracts/verifiers/TransferVerifier.sol";

/// @title DeployLocal
/// @notice Deploys complete stack to local Anvil fork of Base mainnet
/// @dev Uses real ZK verifiers and real $ANON token
///      Run with: anvil --fork-url https://mainnet.base.org
contract DeployLocal is Script {
    // Real $ANON token on Base mainnet
    address constant ANON_TOKEN = 0x0Db510e79909666d6dEc7f5e49370838c16D950f;

    // Uniswap V3 on Base
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        // Use Anvil's default account #0
        uint256 deployerPrivateKey = vm.envOr(
            "DEPLOYER_PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying from:", deployer);
        console.log("Using $ANON token:", ANON_TOKEN);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy real ZK verifiers
        WithdrawVerifier withdrawVerifier = new WithdrawVerifier();
        TransferVerifier transferVerifier = new TransferVerifier();
        console.log("WithdrawVerifier:", address(withdrawVerifier));
        console.log("TransferVerifier:", address(transferVerifier));

        // 2. Deploy pool using real $ANON token
        AnonPool pool = new AnonPool(
            ANON_TOKEN,
            address(withdrawVerifier),
            address(transferVerifier)
        );
        console.log("AnonPool:", address(pool));

        // 3. Deploy AnonPoolGateway (swap + deposit in one tx)
        AnonPoolGateway gateway = new AnonPoolGateway(
            SWAP_ROUTER,
            address(pool),
            ANON_TOKEN,
            WETH,
            USDC
        );
        console.log("AnonPoolGateway:", address(gateway));

        // 4. Deploy AnonPoolAuctionSpender (slot starts now, 5 min settlement window)
        AnonPoolAuctionSpender auctionSpender = new AnonPoolAuctionSpender(
            address(pool),
            deployer, // deployer is also the operator for local testing
            block.timestamp, // slots start now
            0, // settlement window starts immediately after slot
            300 // 5 minute window
        );
        console.log("AnonPoolAuctionSpender:", address(auctionSpender));

        // 5. Add AnonPoolAuctionSpender as approved spender
        pool.addSpender(address(auctionSpender));
        console.log("AnonPoolAuctionSpender added as spender");

        vm.stopBroadcast();

        // Output environment variables for the frontend
        console.log("\n========================================");
        console.log("LOCAL DEVELOPMENT CONFIGURATION");
        console.log("========================================\n");

        console.log("Add to apps/web/.env.local:\n");
        console.log("NEXT_PUBLIC_TESTNET=true");
        console.log("NEXT_PUBLIC_TESTNET_RPC_URL=http://127.0.0.1:8545");
        console.log("NEXT_PUBLIC_POOL_CONTRACT=%s", address(pool));
        console.log("NEXT_PUBLIC_GATEWAY_CONTRACT=%s", address(gateway));
        console.log("NEXT_PUBLIC_AUCTION_CONTRACT=%s", address(auctionSpender));

        console.log("\n========================================");
        console.log("ANVIL ACCOUNTS");
        console.log("========================================\n");
        console.log("Deployer/Operator: %s", deployer);
        console.log("Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
        console.log("\nTest accounts with 10000 ETH each:");
        console.log("Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
        console.log("Account #2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");

        console.log("\n========================================");
        console.log("USEFUL COMMANDS");
        console.log("========================================\n");
        console.log("Check $ANON balance:");
        console.log("  cast call %s 'balanceOf(address)(uint256)' <ADDRESS>", ANON_TOKEN);
        console.log("\nImpersonate a whale (to get tokens for testing):");
        console.log("  # Find a whale on basescan, then use cast send --unlocked");
        console.log("\nCheck pool stats:");
        console.log("  cast call %s 'getPoolStats()(uint256,uint32,bytes32,uint32)'", address(pool));
    }
}
