// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TestANON} from "../src/TestANON.sol";
import {AnonPool} from "../src/AnonPool.sol";
import {AuctionSpender} from "../src/AuctionSpender.sol";

/// @notice Mock verifier that always returns true (for local testing)
contract MockVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

/// @title DeployLocal
/// @notice Deploys complete stack to local Anvil for development
/// @dev Uses mock verifiers that always return true - NOT FOR PRODUCTION
contract DeployLocal is Script {
    function run() external {
        // Use Anvil's default account #0
        uint256 deployerPrivateKey = vm.envOr(
            "DEPLOYER_PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying from:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy mock verifiers (always return true)
        MockVerifier withdrawVerifier = new MockVerifier();
        MockVerifier transferVerifier = new MockVerifier();
        console.log("MockWithdrawVerifier:", address(withdrawVerifier));
        console.log("MockTransferVerifier:", address(transferVerifier));

        // 2. Deploy test token
        TestANON testToken = new TestANON();
        console.log("TestANON:", address(testToken));

        // 3. Deploy pool
        AnonPool pool = new AnonPool(
            address(testToken),
            address(withdrawVerifier),
            address(transferVerifier)
        );
        console.log("AnonPool:", address(pool));

        // 4. Deploy AuctionSpender (slot starts now, 5 min settlement window)
        AuctionSpender auctionSpender = new AuctionSpender(
            address(pool),
            deployer, // deployer is also the operator for local testing
            block.timestamp, // slots start now
            0, // settlement window starts immediately after slot
            300 // 5 minute window
        );
        console.log("AuctionSpender:", address(auctionSpender));

        // 5. Add AuctionSpender as approved spender
        pool.addSpender(address(auctionSpender));
        console.log("AuctionSpender added as spender");

        // 6. Mint test tokens to deployer (1 million tokens)
        testToken.mint(deployer, 1_000_000 * 10**18);
        console.log("Minted 1,000,000 tokens to deployer");

        vm.stopBroadcast();

        // Output environment variables for the frontend
        console.log("\n========================================");
        console.log("LOCAL DEVELOPMENT CONFIGURATION");
        console.log("========================================\n");

        console.log("Add to apps/web/.env.local:\n");
        console.log("NEXT_PUBLIC_TESTNET=true");
        console.log("NEXT_PUBLIC_TESTNET_RPC_URL=http://127.0.0.1:8545");
        console.log("NEXT_PUBLIC_TESTNET_ANON_TOKEN=%s", address(testToken));
        console.log("NEXT_PUBLIC_POOL_CONTRACT=%s", address(pool));
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
        console.log("Mint tokens to an address:");
        console.log("  cast send %s 'mint(address,uint256)' <ADDRESS> 1000000000000000000000 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", address(testToken));
        console.log("\nCheck token balance:");
        console.log("  cast call %s 'balanceOf(address)(uint256)' <ADDRESS>", address(testToken));
        console.log("\nCheck pool stats:");
        console.log("  cast call %s 'getPoolStats()(uint256,uint32,bytes32,uint32)'", address(pool));
    }
}
