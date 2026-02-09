#!/usr/bin/env bun
/**
 * End-to-end test script for validating the complete user flow:
 * 1. Buy ANON tokens with ETH via AnonPoolGateway (swap + deposit in one tx)
 * 2. Submit multiple bids with increasing amounts
 * 3. Test invalid bid (lower than current highest)
 * 4. Test bid with missing fields
 * 5. Verify auction state updates correctly
 *
 * Prerequisites:
 * 1. Run `./scripts/local-dev.sh` to start Anvil and deploy contracts
 *
 * Usage:
 *   ./scripts/test-auction.sh  (recommended - manages test server)
 *   bun run scripts/test-auction.ts  (requires running server)
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load env from monorepo root
config({ path: resolve(import.meta.dir, "../.env") });

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  parseEther,
  formatUnits,
  formatEther,
  pad,
  toHex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { base } from "viem/chains";

// Import from SDK
import { PrivacyWallet, computeNullifierHash } from "../packages/sdk/src/core";
import { ANON_POOL_GATEWAY_ABI } from "../packages/sdk/src/config";

// Configuration from .env
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
const API_URL = process.env.API_URL || "http://localhost:3000";

// Uniswap V3 addresses on Base
const QUOTER_V2 = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as `0x${string}`;
const WETH = "0x4200000000000000000000000000000000000006" as `0x${string}`;
const ANON_TOKEN = "0x0Db510e79909666d6dEc7f5e49370838c16D950f" as `0x${string}`;

// Anvil's default test account #0 (for ETH funding)
const ANVIL_PRIVATE_KEY_0 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

// Generate a fresh account for each test run
const PRIVATE_KEY = generatePrivateKey();

// Get contract addresses from env
const POOL_ADDRESS = (process.env.POOL_ADDRESS ||
  process.env.NEXT_PUBLIC_POOL_CONTRACT) as `0x${string}`;
const GATEWAY_ADDRESS = (process.env.GATEWAY_ADDRESS ||
  process.env.NEXT_PUBLIC_GATEWAY_CONTRACT) as `0x${string}`;

if (!POOL_ADDRESS) {
  console.error("Error: No pool address found.");
  console.error(
    "Run ./scripts/local-dev.sh first, or set POOL_ADDRESS env var",
  );
  process.exit(1);
}

if (!GATEWAY_ADDRESS) {
  console.error("Error: No gateway address found.");
  console.error(
    "Run ./scripts/local-dev.sh first, or set GATEWAY_ADDRESS env var",
  );
  process.exit(1);
}

// Quoter ABI for getting swap quotes
const QUOTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

console.log("========================================");
console.log("  AnonPool Full User Flow Test");
console.log("========================================");
console.log("");
console.log("Configuration:");
console.log(`  RPC URL:    ${RPC_URL}`);
console.log(`  API URL:    ${API_URL}`);
console.log(`  Pool:       ${POOL_ADDRESS}`);
console.log(`  Gateway:    ${GATEWAY_ADDRESS}`);
console.log(`  Token:      ${ANON_TOKEN}`);
console.log("");

// Setup clients
const account = privateKeyToAccount(PRIVATE_KEY);
console.log(`  Account:    ${account.address}`);
console.log("");

const publicClient = createPublicClient({
  chain: { ...base, id: 8453 },
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: { ...base, id: 8453 },
  transport: http(RPC_URL),
});

// API response types
type AuctionCurrentResponse = {
  currentSlotId: number;
  highestBid: string;
  highestBidContent?: {
    content: string;
    images?: string[];
    embeds?: string[];
  };
  timeRemaining: number;
  bidCount: number;
};

type BidResponse = {
  success?: boolean;
  error?: string;
};

// Test results tracking
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function logTest(name: string, passed: boolean, details?: string) {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`  ✅ ${name}`);
  } else {
    testsFailed++;
    console.log(`  ❌ ${name}`);
    if (details) console.log(`     ${details}`);
  }
}

async function main() {
  // Step 0: Fund fresh test account with ETH
  console.log("Step 0: Funding fresh test account with ETH...");

  const ethFunder = privateKeyToAccount(ANVIL_PRIVATE_KEY_0);
  const ethFunderClient = createWalletClient({
    account: ethFunder,
    chain: { ...base, id: 8453 },
    transport: http(RPC_URL),
  });

  // Send ETH for gas and buying ANON
  const fundAmount = parseEther("1");
  await ethFunderClient.sendTransaction({
    to: account.address,
    value: fundAmount,
  });
  console.log(`  Sent ${formatEther(fundAmount)} ETH`);
  console.log("");

  // Step 1: Create privacy wallet
  console.log("Step 1: Setting up privacy wallet...");

  // Create a deterministic signature for the wallet
  const signMessage = PrivacyWallet.getSignMessage();
  const signature = await walletClient.signMessage({ message: signMessage });
  const privacyWallet = PrivacyWallet.fromSignature(
    signature,
    POOL_ADDRESS,
    RPC_URL,
  );
  console.log("  Privacy wallet created");
  console.log("");

  // Step 2: Buy ANON with ETH via Gateway (swap + deposit in one tx)
  console.log("Step 2: Buying ANON with ETH via Gateway...");

  // Get quote for 0.1 ETH -> ANON
  const ethToSwap = parseEther("0.1");
  console.log(`  Getting quote for ${formatEther(ethToSwap)} ETH...`);

  let quoteResult: bigint;
  try {
    const result = await publicClient.simulateContract({
      address: QUOTER_V2,
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: WETH,
          tokenOut: ANON_TOKEN,
          amountIn: ethToSwap,
          fee: 10000, // 1%
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    quoteResult = result.result[0];
    console.log(`  Quote: ${formatEther(ethToSwap)} ETH = ${formatUnits(quoteResult, 18)} ANON`);
  } catch (e) {
    console.error("  Failed to get quote - pool may not have liquidity");
    console.error(e);
    process.exit(1);
  }

  // Generate commitment for the deposit
  const { note: depositNote } = privacyWallet.generateDepositNote(quoteResult);
  const commitmentBytes = pad(toHex(depositNote.commitment), {
    size: 32,
  }) as `0x${string}`;
  console.log(`  Generated commitment: ${commitmentBytes.slice(0, 20)}...`);

  // Apply 1% slippage to minAmountOut
  const minAmountOut = (quoteResult * 99n) / 100n;

  // Execute swap + deposit via gateway
  const swapDepositHash = await walletClient.writeContract({
    address: GATEWAY_ADDRESS,
    abi: ANON_POOL_GATEWAY_ABI,
    functionName: "depositWithETH",
    args: [commitmentBytes, minAmountOut],
    value: ethToSwap,
  });

  console.log(`  Tx: ${swapDepositHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: swapDepositHash,
  });
  console.log(`  Status: ${receipt.status === "success" ? "SUCCESS" : "FAILED"}`);
  console.log(`  Gas used: ${receipt.gasUsed}`);

  if (receipt.status !== "success") {
    console.error("  Gateway swap+deposit failed!");
    process.exit(1);
  }

  // Sync wallet to pick up deposit
  await privacyWallet.syncFromChain();
  const balance = privacyWallet.getBalance();
  console.log(`  Private balance: ${formatUnits(balance.available, 18)} ANON`);
  logTest("Gateway swap+deposit succeeded", balance.available > 0n);
  console.log("");

  // Step 3: Get current auction state
  console.log("Step 3: Checking current auction state...");

  const currentRes = await fetch(`${API_URL}/api/auction/current`);
  const currentData = (await currentRes.json()) as AuctionCurrentResponse;
  console.log(`  Current slot: ${currentData.currentSlotId}`);
  console.log(
    `  Highest bid: ${formatUnits(BigInt(currentData.highestBid || "0"), 18)} ANON`,
  );
  console.log(`  Time remaining: ${currentData.timeRemaining}s`);
  console.log("");

  // Step 4: Run bid tests
  console.log("Step 4: Running bid tests...");
  console.log("");

  const slotId = currentData.currentSlotId;

  // Base bid amounts on current highest to handle existing bids
  const currentHighest = BigInt(currentData.highestBid || "0");
  const baseBid = currentHighest > 0n ? currentHighest + parseUnits("10", 18) : parseUnits("10", 18);

  // Test 4a: Submit valid bid #1
  const bid1Amount = baseBid;
  console.log(`Test 4a: Submit valid bid #1 (${formatUnits(bid1Amount, 18)} ANON)`);
  const bid1Result = await submitBid(
    privacyWallet,
    slotId,
    bid1Amount,
    "First test post!",
  );
  logTest("Valid bid #1 accepted", bid1Result.success, bid1Result.error);

  // Test 4b: Submit valid bid #2 (higher)
  const bid2Amount = bid1Amount + parseUnits("10", 18);
  console.log(`Test 4b: Submit valid bid #2 (${formatUnits(bid2Amount, 18)} ANON)`);
  const bid2Result = await submitBid(
    privacyWallet,
    slotId,
    bid2Amount,
    "Second test post - higher bid!",
  );
  logTest("Valid bid #2 accepted", bid2Result.success, bid2Result.error);

  // Test 4c: Submit invalid bid (lower than current)
  const bid3Amount = parseUnits("5", 18);
  console.log(`Test 4c: Submit invalid bid (${formatUnits(bid3Amount, 18)} ANON - lower than current)`);
  const bid3Result = await submitBid(
    privacyWallet,
    slotId,
    bid3Amount,
    "This should fail",
  );
  logTest(
    "Low bid rejected",
    !bid3Result.success && (bid3Result.error?.includes("higher") ?? false),
    bid3Result.error,
  );

  // Test 4d: Submit valid bid #3 (even higher)
  const bid4Amount = bid2Amount + parseUnits("30", 18);
  console.log(`Test 4d: Submit valid bid #3 (${formatUnits(bid4Amount, 18)} ANON)`);
  const bid4Result = await submitBid(
    privacyWallet,
    slotId,
    bid4Amount,
    "Third test post - highest bid!",
  );
  logTest("Valid bid #3 accepted", bid4Result.success, bid4Result.error);

  // Test 4e: Missing required fields
  console.log("Test 4e: Submit bid with missing content");
  const bid5Result = await submitBidRaw({
    bidAmount: parseUnits("100", 18).toString(),
    proof: { proof: [], publicInputs: ["0x1", "0x2", "0x3", "0x4"] },
    claimCommitment: "0x1234",
    // content is missing
  });
  logTest(
    "Missing content rejected",
    !bid5Result.success && (bid5Result.error?.includes("Missing") ?? false),
    bid5Result.error,
  );

  // Test 4f: Content too long
  console.log("Test 4f: Submit bid with content too long");
  const longContent = "x".repeat(400); // Over 320 char limit
  const bid6Result = await submitBidRaw({
    content: longContent,
    bidAmount: parseUnits("100", 18).toString(),
    proof: { proof: [], publicInputs: ["0x1", "0x2", "0x3", "0x4"] },
    claimCommitment: "0x1234",
  });
  logTest(
    "Long content rejected",
    !bid6Result.success &&
      (bid6Result.error?.includes("maximum length") ?? false),
    bid6Result.error,
  );

  console.log("");

  // Step 5: Verify final auction state
  console.log("Step 5: Verifying final auction state...");

  const finalRes = await fetch(`${API_URL}/api/auction/current`);
  const finalData = (await finalRes.json()) as AuctionCurrentResponse;
  console.log(
    `  Highest bid: ${formatUnits(BigInt(finalData.highestBid || "0"), 18)} ANON`,
  );
  console.log(`  Bid count: ${finalData.bidCount}`);

  const expectedHighest = bid4Amount; // 50 ANON was the highest valid bid
  logTest(
    "Highest bid is correct (50 ANON)",
    BigInt(finalData.highestBid) === expectedHighest,
    `Expected ${formatUnits(expectedHighest, 18)}, got ${formatUnits(BigInt(finalData.highestBid || "0"), 18)}`,
  );

  // Test: Verify highestBidContent is returned
  const expectedContent = "Third test post - highest bid!";
  logTest(
    "Highest bid content is returned",
    finalData.highestBidContent?.content === expectedContent,
    `Expected "${expectedContent}", got "${finalData.highestBidContent?.content}"`,
  );

  console.log("");
  console.log("========================================");
  console.log(`  Results: ${testsPassed}/${testsRun} passed`);
  if (testsFailed > 0) {
    console.log(`  ❌ ${testsFailed} test(s) failed`);
  } else {
    console.log("  ✅ All tests passed!");
  }
  console.log("========================================");

  process.exit(testsFailed > 0 ? 1 : 0);
}

async function submitBid(
  wallet: PrivacyWallet,
  slotId: number,
  amount: bigint,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get claim credentials for this slot
    const claimCreds = wallet.getClaimCredentials(slotId);

    // Prepare transfer
    const transferData = await wallet.prepareTransfer(
      amount,
      claimCreds.claimCommitment,
    );
    if (!transferData) {
      return {
        success: false,
        error: "No available notes for this bid amount",
      };
    }

    // Build mock proof (proof verification is TODO in API)
    const mockProof = {
      proof: [],
      publicInputs: [
        `0x${transferData.nullifierHash.toString(16)}`,
        `0x${transferData.merkleProof.root.toString(16)}`,
        `0x${amount.toString(16)}`,
        `0x${transferData.changeNote.commitment.toString(16)}`,
        `0x${transferData.changeNote.amount.toString(16)}`,
        `0x${claimCreds.claimCommitment.toString(16)}`,
      ],
    };

    const response = await fetch(`${API_URL}/api/auction/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        bidAmount: amount.toString(),
        proof: mockProof,
        claimCommitment: `0x${claimCreds.claimCommitment.toString(16)}`,
      }),
    });

    const data = (await response.json()) as BidResponse;

    if (!response.ok) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function submitBidRaw(
  body: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/api/auction/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as BidResponse;

    if (!response.ok) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
