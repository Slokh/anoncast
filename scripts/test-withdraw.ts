#!/usr/bin/env bun
/**
 * End-to-end test script for validating deposit and withdraw flow
 *
 * Prerequisites:
 * 1. Run `./scripts/local-dev.sh` to start Anvil and deploy contracts
 * 2. Start the web server: `bun run dev` (for server-side proof generation)
 *
 * Usage:
 *   bun run test:e2e                    # Server-side proofs (default, ~7s)
 *   bun run test:e2e --client           # Client-side proofs (slower, ~70s)
 *   bun run test:e2e 0x...              # Override pool address
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load env from monorepo root
config({ path: resolve(import.meta.dir, '../.env') })

import { createPublicClient, createWalletClient, http, parseUnits, parseEther, formatUnits, pad, toHex } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { base } from 'viem/chains'

// Import from SDK
import {
  generateNote,
  computeCommitment,
  computeNullifierHash,
  MerkleTree,
  WithdrawVerifier,
  MERKLE_DEPTH,
} from '../packages/sdk/src/core'
import { ERC20_ABI, ANON_POOL_ABI } from '../packages/sdk/src/config'

// Configuration from .env
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545'
const API_URL = process.env.API_URL || 'http://localhost:3000'
const ANON_TOKEN = (process.env.ANON_TOKEN || '0x0Db510e79909666d6dEc7f5e49370838c16D950f') as `0x${string}`

// Anvil's default test account #0 (for ETH funding)
const ANVIL_ACCOUNT_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
const ANVIL_PRIVATE_KEY_0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const

// Whale address holding $ANON (used via Anvil impersonation for funding)
const WHALE_ADDRESS = '0x8117efF53BA83D42408570c69C6da85a2Bb6CA05' as const

// Generate a fresh account for each test run to avoid state conflicts
const PRIVATE_KEY = generatePrivateKey()

// Parse command line arguments
const args = process.argv.slice(2)
const useClientMode = args.includes('--client') || process.env.PROVER_MODE === 'client'
const useServerMode = !useClientMode
const poolArg = args.find(arg => arg.startsWith('0x'))

// Get pool address from args, env, or .env file
const POOL_ADDRESS = (poolArg || process.env.POOL_ADDRESS || process.env.NEXT_PUBLIC_POOL_CONTRACT) as `0x${string}`

if (!POOL_ADDRESS) {
  console.error('Error: No pool address found.')
  console.error('Run ./scripts/local-dev.sh first, or specify address:')
  console.error('  bun run test:e2e 0x...')
  console.error('   or: POOL_ADDRESS=0x... bun run scripts/test-withdraw.ts')
  process.exit(1)
}

console.log('========================================')
console.log('  AnonPool E2E Withdraw Test')
console.log('========================================')
console.log('')
console.log('Configuration:')
console.log(`  RPC URL:    ${RPC_URL}`)
console.log(`  Pool:       ${POOL_ADDRESS}`)
console.log(`  Token:      ${ANON_TOKEN}`)
console.log(`  Prover:     ${useServerMode ? 'Server (native bb CLI)' : 'Client (bb.js WASM)'}`)
console.log('')

// Setup clients
const account = privateKeyToAccount(PRIVATE_KEY)
console.log(`  Account:    ${account.address}`)
console.log('')

const publicClient = createPublicClient({
  chain: { ...base, id: 8453 },  // Use Base chain config
  transport: http(RPC_URL),
})

const walletClient = createWalletClient({
  account,
  chain: { ...base, id: 8453 },
  transport: http(RPC_URL),
})

async function main() {
  // Step 0: Fund fresh test account using Anvil impersonation
  console.log('Step 0: Funding fresh test account...')

  // Use Anvil account #0 for ETH
  const ethFunder = privateKeyToAccount(ANVIL_PRIVATE_KEY_0)
  const ethWallet = createWalletClient({
    account: ethFunder,
    chain: { ...base, id: 8453 },
    transport: http(RPC_URL),
  })

  // Transfer ETH for gas
  const ethAmount = parseEther('1')
  const ethTx = await ethWallet.sendTransaction({
    to: account.address,
    value: ethAmount,
  })
  await publicClient.waitForTransactionReceipt({ hash: ethTx })
  console.log(`  Funded ${formatUnits(ethAmount, 18)} ETH`)

  // Use whale impersonation for ANON tokens (Anvil --auto-impersonate)
  const whaleWallet = createWalletClient({
    account: WHALE_ADDRESS,
    chain: { ...base, id: 8453 },
    transport: http(RPC_URL),
  })

  // Transfer ANON tokens for testing
  const anonAmount = parseUnits('100', 18)
  const anonTx = await whaleWallet.writeContract({
    address: ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [account.address, anonAmount],
  })
  await publicClient.waitForTransactionReceipt({ hash: anonTx })
  console.log(`  Funded ${formatUnits(anonAmount, 18)} ANON`)

  // Step 1: Check balances
  console.log('')
  console.log('Step 1: Checking balances...')

  const tokenBalance = await publicClient.readContract({
    address: ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint

  console.log(`  Token balance: ${formatUnits(tokenBalance, 18)} ANON`)

  // Step 2: Generate a note for deposit
  console.log('')
  console.log('Step 2: Generating deposit note...')

  const depositAmount = parseUnits('10', 18) // 10 ANON
  const note = generateNote(depositAmount)

  console.log(`  Amount:      ${formatUnits(depositAmount, 18)} ANON`)
  console.log(`  Commitment:  ${toHex(note.commitment).slice(0, 20)}...`)

  // Step 3: Approve tokens
  console.log('')
  console.log('Step 3: Approving tokens...')

  const approveTx = await walletClient.writeContract({
    address: ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [POOL_ADDRESS, depositAmount],
  })

  await publicClient.waitForTransactionReceipt({ hash: approveTx })
  console.log(`  Approved: ${approveTx}`)

  // Step 4: Deposit
  console.log('')
  console.log('Step 4: Depositing to pool...')

  const commitmentBytes = pad(toHex(note.commitment), { size: 32 }) as `0x${string}`

  const depositTx = await walletClient.writeContract({
    address: POOL_ADDRESS,
    abi: ANON_POOL_ABI,
    functionName: 'deposit',
    args: [commitmentBytes, depositAmount],
  })

  const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositTx })
  console.log(`  Deposited: ${depositTx}`)

  // Get leaf index from Deposit event
  // Event signature: Deposit(bytes32 indexed commitment, uint256 amount, uint32 leafIndex, uint256 timestamp)
  const DEPOSIT_EVENT_SIGNATURE = '0xce80217ac10251ba83b6b6ce91da12bdd096aa99c37336c00bb01815ff8e77c1'

  const depositEvent = depositReceipt.logs.find(log =>
    log.address.toLowerCase() === POOL_ADDRESS.toLowerCase() &&
    log.topics[0] === DEPOSIT_EVENT_SIGNATURE &&
    log.topics[1]?.toLowerCase() === commitmentBytes.toLowerCase()
  )

  if (!depositEvent) {
    console.error('Error: Could not find Deposit event in transaction receipt')
    process.exit(1)
  }

  // Parse leaf index from event data
  // Data format: (uint256 amount, uint32 leafIndex, uint256 timestamp) = 96 bytes
  // chars 2-65: amount, chars 66-129: leafIndex (uint32 right-aligned in 32 bytes), chars 130-193: timestamp
  const leafIndex = parseInt(depositEvent.data.slice(122, 130), 16)
  console.log(`  Leaf index: ${leafIndex}`)

  // Step 5: Build Merkle tree and get proof
  console.log('')
  console.log('Step 5: Building Merkle tree...')

  // Fetch ALL deposits from chain to build tree
  // Query from a reasonable range to avoid hitting the remote fork RPC
  // The pool contract was deployed locally, so all deposits are in recent local blocks
  const currentBlock = await publicClient.getBlockNumber()
  const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n

  const depositLogs = await publicClient.getLogs({
    address: POOL_ADDRESS,
    event: {
      type: 'event',
      name: 'Deposit',
      inputs: [
        { name: 'commitment', type: 'bytes32', indexed: true },
        { name: 'amount', type: 'uint256', indexed: false },
        { name: 'leafIndex', type: 'uint32', indexed: false },
        { name: 'timestamp', type: 'uint256', indexed: false },
      ],
    },
    fromBlock,
    toBlock: 'latest',
  })

  // Filter to only Deposit events and parse their data
  // Event signature: Deposit(bytes32 indexed commitment, uint256 amount, uint32 leafIndex, uint256 timestamp)
  const DEPOSIT_SIG = '0xce80217ac10251ba83b6b6ce91da12bdd096aa99c37336c00bb01815ff8e77c1'
  const allDeposits = depositLogs
    .filter(log => log.topics[0] === DEPOSIT_SIG)
    .map(log => ({
      commitment: BigInt(log.topics[1] as string),
      leafIndex: parseInt(log.data.slice(122, 130), 16),
      blockNumber: log.blockNumber,
    }))

  // Find OUR deposit by matching commitment (not just leaf index)
  const ourDeposit = allDeposits.find(d => d.commitment === note.commitment)
  if (!ourDeposit) {
    console.error(`  ERROR: Our commitment not found in logs!`)
    console.error(`  Our commitment: ${toHex(note.commitment)}`)
    process.exit(1)
  }

  // Find all deposits from the current pool "session" by looking at block order
  // Our deposit is at leaf index N, so we need deposits 0..N from the same deployment
  // Find the most recent leaf 0 that came before or at our deposit's block
  const leaf0Deposits = allDeposits
    .filter(d => d.leafIndex === 0 && d.blockNumber <= ourDeposit.blockNumber)
    .sort((a, b) => Number(b.blockNumber - a.blockNumber)) // Most recent first

  const currentSessionStart = leaf0Deposits[0]
  if (!currentSessionStart) {
    console.error(`  ERROR: Could not find session start (leaf 0)`)
    process.exit(1)
  }

  // Get all deposits from this session (starting from the leaf 0 we found)
  const sessionDeposits = allDeposits
    .filter(d => d.blockNumber >= currentSessionStart.blockNumber)
    .sort((a, b) => a.leafIndex - b.leafIndex)
    .filter((d, idx) => d.leafIndex === idx) // Sequential from 0

  console.log(`  Found ${sessionDeposits.length} deposits`)

  // Verify our deposit is in the session
  const ourDepositInSession = sessionDeposits.find(d => d.commitment === note.commitment)
  if (!ourDepositInSession) {
    console.error(`  ERROR: Our deposit not in current session!`)
    process.exit(1)
  }

  // Build tree with commitments in order
  const tree = new MerkleTree(MERKLE_DEPTH)
  for (const log of sessionDeposits) {
    tree.insert(log.commitment)
  }

  const merkleRoot = tree.getRoot()
  const { path: pathElements, indices: pathIndices } = tree.getProof(leafIndex)

  console.log(`  Merkle root: ${toHex(merkleRoot).slice(0, 20)}...`)

  // Verify root is known on chain
  const rootBytes = pad(toHex(merkleRoot), { size: 32 }) as `0x${string}`
  const isKnownRoot = await publicClient.readContract({
    address: POOL_ADDRESS,
    abi: ANON_POOL_ABI,
    functionName: 'isKnownRoot',
    args: [rootBytes],
  })

  console.log(`  Root known:  ${isKnownRoot}`)

  if (!isKnownRoot) {
    console.error('Error: Merkle root not recognized by contract')
    process.exit(1)
  }

  // Step 6: Generate ZK proof
  console.log('')
  console.log(`Step 6: Generating ZK proof via ${useServerMode ? 'server' : 'client'}...`)

  const recipientBigInt = BigInt(account.address)
  const nullifierHash = computeNullifierHash(note.nullifier)

  const proofInput = {
    note: {
      secret: note.secret,
      nullifier: note.nullifier,
      commitment: note.commitment,
      amount: depositAmount,
      leafIndex,
    },
    merklePath: pathElements,
    merkleIndices: pathIndices,
    merkleRoot: merkleRoot,
    recipient: recipientBigInt,
  }

  let proofData: { proof: number[], publicInputs: string[] }
  const startTime = performance.now()

  if (useServerMode) {
    // Server-side proof generation via API
    const apiPayload = {
      note: {
        secret: note.secret.toString(),
        nullifier: note.nullifier.toString(),
        amount: depositAmount.toString(),
      },
      merklePath: pathElements.map((p: bigint) => p.toString()),
      merkleIndices: pathIndices,
      merkleRoot: merkleRoot.toString(),
      recipient: recipientBigInt.toString(),
    }

    const response = await fetch(`${API_URL}/api/prove/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Server proof generation failed: ${error.error || 'Unknown error'}`)
    }

    const result = await response.json()
    proofData = { proof: result.proof, publicInputs: result.publicInputs }
  } else {
    // Client-side proof generation via bb.js WASM
    const circuit = await import('../packages/protocol/circuits/withdraw/target/anon_withdraw.json')
    const vkey = await import('../packages/protocol/circuits/withdraw/target/vk.json')
    const verifier = new WithdrawVerifier(circuit.default || circuit, vkey.default || vkey)
    proofData = await verifier.generateSolidityWithdrawProof(proofInput)
  }

  const proofTime = performance.now() - startTime

  console.log(`  Proof generated in ${(proofTime / 1000).toFixed(1)}s`)
  console.log(`  Proof size: ${proofData.proof.length} bytes`)

  // Step 7: Withdraw
  console.log('')
  console.log('Step 7: Withdrawing from pool...')

  const balanceBefore = await publicClient.readContract({
    address: ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint

  const proofBytes = new Uint8Array(proofData.proof)
  const nullifierBytes = pad(toHex(nullifierHash), { size: 32 }) as `0x${string}`

  const withdrawTx = await walletClient.writeContract({
    address: POOL_ADDRESS,
    abi: ANON_POOL_ABI,
    functionName: 'withdraw',
    args: [
      toHex(proofBytes),
      nullifierBytes,
      rootBytes,
      depositAmount,
      account.address,
    ],
  })

  await publicClient.waitForTransactionReceipt({ hash: withdrawTx })
  console.log(`  Withdrawn: ${withdrawTx}`)

  // Verify balance increased
  const balanceAfter = await publicClient.readContract({
    address: ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint

  const balanceChange = balanceAfter - balanceBefore

  console.log('')
  console.log('========================================')
  console.log('  Test Complete!')
  console.log('========================================')
  console.log('')
  console.log(`  Deposited:  ${formatUnits(depositAmount, 18)} ANON`)
  console.log(`  Withdrawn:  ${formatUnits(balanceChange, 18)} ANON`)
  console.log(`  Success:    ${balanceChange === depositAmount ? 'YES ✓' : 'NO ✗'}`)
  console.log('')

  if (balanceChange !== depositAmount) {
    console.error('Error: Balance change does not match deposit amount!')
    process.exit(1)
  }

  // Explicitly exit to terminate bb.js WASM workers
  process.exit(0)
}

main().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
