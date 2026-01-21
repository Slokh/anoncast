/**
 * End-to-end test for deposit + withdraw flow
 * Run against local anvil fork: bun run scripts/test-withdraw-flow.ts
 *
 * Reads contract addresses from apps/web/.env.local (created by local-dev.sh)
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, toHex, pad, keccak256, concat } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Read contract addresses from .env.local (created by local-dev.sh)
function getPoolAddress(): `0x${string}` {
  const envPath = resolve(__dirname, '../../../apps/web/.env.local')

  if (!existsSync(envPath)) {
    console.error('Error: apps/web/.env.local not found')
    console.error('Run ./scripts/local-dev.sh first to deploy contracts')
    process.exit(1)
  }

  const envContent = readFileSync(envPath, 'utf-8')
  const match = envContent.match(/NEXT_PUBLIC_POOL_CONTRACT=(\S+)/)

  if (!match) {
    console.error('Error: NEXT_PUBLIC_POOL_CONTRACT not found in .env.local')
    process.exit(1)
  }

  return match[1] as `0x${string}`
}

const POOL_ADDRESS = getPoolAddress()
const ANON_TOKEN = '0x0Db510e79909666d6dEc7f5e49370838c16D950f' as const

// Anvil default account #0
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const

// ABIs
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const

const POOL_ABI = [
  { name: 'deposit', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'commitment', type: 'bytes32' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'proof', type: 'bytes' }, { name: 'nullifierHash', type: 'bytes32' }, { name: 'root', type: 'bytes32' }, { name: 'amount', type: 'uint256' }, { name: 'recipient', type: 'address' }], outputs: [] },
  { name: 'getLastRoot', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'isKnownRoot', type: 'function', stateMutability: 'view', inputs: [{ name: 'root', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'nextLeafIndex', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint32' }] },
  { name: 'getCommitmentData', type: 'function', stateMutability: 'view', inputs: [{ name: 'commitment', type: 'bytes32' }], outputs: [{ name: 'exists', type: 'bool' }, { name: 'leafIndex', type: 'uint32' }] },
  { name: 'nullifierSpent', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'withdrawVerifier', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'filledSubtrees', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'zeros', type: 'function', stateMutability: 'view', inputs: [{ name: 'level', type: 'uint256' }], outputs: [{ name: '', type: 'bytes32' }] },
] as const

const VERIFIER_ABI = [
  { name: 'verify', type: 'function', stateMutability: 'view', inputs: [{ name: 'proof', type: 'bytes' }, { name: 'publicInputs', type: 'bytes32[]' }], outputs: [{ name: '', type: 'bool' }] },
] as const

// Field size for BN254
const FIELD_SIZE = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617')
const MERKLE_DEPTH = 20

// Hash functions matching the circuit
function hashTwo(left: bigint, right: bigint): bigint {
  const packed = concat([
    pad(toHex(left), { size: 32 }),
    pad(toHex(right), { size: 32 })
  ])
  return BigInt(keccak256(packed)) % FIELD_SIZE
}

function computeCommitment(secret: bigint, nullifier: bigint, amount: bigint): bigint {
  const first = hashTwo(secret, nullifier)
  return hashTwo(first, amount)
}

function computeNullifierHash(nullifier: bigint): bigint {
  const packed = pad(toHex(nullifier), { size: 32 })
  return BigInt(keccak256(packed)) % FIELD_SIZE
}

// Simple incremental merkle tree
class MerkleTree {
  private levels: number
  private zeros: bigint[]
  private filledSubtrees: bigint[]
  private leaves: bigint[] = []

  constructor(levels: number) {
    this.levels = levels
    this.zeros = []
    this.filledSubtrees = []

    // Initialize zero values (must match contract)
    // Contract does: keccak256("anon_pool") - raw bytes of the string
    const encoder = new TextEncoder()
    const zeroHash = keccak256(toHex(encoder.encode('anon_pool')))
    let current = BigInt(zeroHash) % FIELD_SIZE
    this.zeros.push(current)
    for (let i = 1; i < levels; i++) {
      current = hashTwo(current, current)
      this.zeros.push(current)
    }

    // Initialize filled subtrees
    for (let i = 0; i < levels; i++) {
      this.filledSubtrees.push(this.zeros[i])
    }
  }

  insert(leaf: bigint): number {
    const index = this.leaves.length
    this.leaves.push(leaf)

    let currentHash = leaf
    let currentIndex = index

    for (let i = 0; i < this.levels; i++) {
      if (currentIndex % 2 === 0) {
        this.filledSubtrees[i] = currentHash
        currentHash = hashTwo(currentHash, this.zeros[i])
      } else {
        currentHash = hashTwo(this.filledSubtrees[i], currentHash)
      }
      currentIndex = Math.floor(currentIndex / 2)
    }

    return index
  }

  getRoot(): bigint {
    if (this.leaves.length === 0) {
      let current = this.zeros[this.levels - 1]
      return hashTwo(current, current)
    }

    let currentHash = this.filledSubtrees[0]
    let currentIndex = this.leaves.length - 1

    for (let i = 0; i < this.levels; i++) {
      if (currentIndex % 2 === 0) {
        currentHash = hashTwo(this.filledSubtrees[i], this.zeros[i])
      } else {
        currentHash = hashTwo(this.filledSubtrees[i], currentHash)
      }
      currentIndex = Math.floor(currentIndex / 2)
    }

    // Recompute from scratch to be sure
    return this.computeRootFromLeaves()
  }

  private computeRootFromLeaves(): bigint {
    if (this.leaves.length === 0) {
      let current = this.zeros[this.levels - 1]
      return hashTwo(current, current)
    }

    // Pad leaves to power of 2
    const totalLeaves = Math.pow(2, this.levels)
    const paddedLeaves: bigint[] = [...this.leaves]
    while (paddedLeaves.length < totalLeaves) {
      paddedLeaves.push(this.zeros[0])
    }

    // Build tree level by level
    let currentLevel = paddedLeaves
    for (let level = 0; level < this.levels; level++) {
      const nextLevel: bigint[] = []
      for (let i = 0; i < currentLevel.length; i += 2) {
        nextLevel.push(hashTwo(currentLevel[i], currentLevel[i + 1]))
      }
      currentLevel = nextLevel
    }

    return currentLevel[0]
  }

  getProof(leafIndex: number): { path: bigint[], indices: number[] } {
    const path: bigint[] = []
    const indices: number[] = []

    // Pad leaves to power of 2
    const totalLeaves = Math.pow(2, this.levels)
    const paddedLeaves: bigint[] = [...this.leaves]
    while (paddedLeaves.length < totalLeaves) {
      paddedLeaves.push(this.zeros[0])
    }

    // Build all levels
    const levels: bigint[][] = [paddedLeaves]
    let currentLevel = paddedLeaves
    for (let level = 0; level < this.levels; level++) {
      const nextLevel: bigint[] = []
      for (let i = 0; i < currentLevel.length; i += 2) {
        nextLevel.push(hashTwo(currentLevel[i], currentLevel[i + 1]))
      }
      levels.push(nextLevel)
      currentLevel = nextLevel
    }

    // Extract proof
    let idx = leafIndex
    for (let level = 0; level < this.levels; level++) {
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1
      path.push(levels[level][siblingIdx])
      indices.push(idx % 2)
      idx = Math.floor(idx / 2)
    }

    return { path, indices }
  }
}

async function main() {
  console.log('=== Deposit + Withdraw Flow Test ===\n')
  console.log('Pool contract:', POOL_ADDRESS)
  console.log('')

  // Setup clients
  const publicClient = createPublicClient({
    chain: { ...base, id: 8453 },
    transport: http('http://127.0.0.1:8545'),
  })

  const account = privateKeyToAccount(DEPLOYER_KEY)
  const walletClient = createWalletClient({
    account,
    chain: { ...base, id: 8453 },
    transport: http('http://127.0.0.1:8545'),
  })

  console.log('Account:', account.address)

  // Check initial balances
  const initialTokenBalance = await publicClient.readContract({
    address: ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })
  console.log('Initial token balance:', formatUnits(initialTokenBalance, 18), 'ANON')

  // Get some tokens if needed using anvil_setStorageAt to directly set balance
  if (initialTokenBalance < parseUnits('1000', 18)) {
    console.log('\nSetting token balance using anvil...')

    // For standard ERC20, balanceOf mapping is at slot 0
    // storage slot = keccak256(abi.encode(address, slot))
    const balanceSlot = keccak256(
      concat([
        pad(account.address, { size: 32 }),
        pad(toHex(0), { size: 32 }) // slot 0 for balanceOf mapping
      ])
    )

    const amount = parseUnits('100000', 18)

    await publicClient.request({
      // @ts-ignore
      method: 'anvil_setStorageAt',
      params: [ANON_TOKEN, balanceSlot, pad(toHex(amount), { size: 32 })],
    })
    console.log('Set token balance to', formatUnits(amount, 18), 'ANON')
  }

  // Check balance after
  const tokenBalance = await publicClient.readContract({
    address: ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })
  console.log('Token balance:', formatUnits(tokenBalance, 18), 'ANON')

  // Generate deposit note
  console.log('\n--- Step 1: Generate Deposit Note ---')
  const depositAmount = parseUnits('100', 18)
  const secret = BigInt(keccak256(toHex('test-secret-' + Date.now(), { size: 32 }))) % FIELD_SIZE
  const nullifier = BigInt(keccak256(toHex('test-nullifier-' + Date.now(), { size: 32 }))) % FIELD_SIZE
  const commitment = computeCommitment(secret, nullifier, depositAmount)

  console.log('Deposit amount:', formatUnits(depositAmount, 18), 'ANON')
  console.log('Secret:', `0x${secret.toString(16).slice(0, 16)}...`)
  console.log('Nullifier:', `0x${nullifier.toString(16).slice(0, 16)}...`)
  console.log('Commitment:', `0x${commitment.toString(16)}`)

  // Approve tokens
  console.log('\n--- Step 2: Approve Tokens ---')
  const approveHash = await walletClient.writeContract({
    address: ANON_TOKEN,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [POOL_ADDRESS, depositAmount],
  })
  await publicClient.waitForTransactionReceipt({ hash: approveHash })
  console.log('Approved')

  // Deposit
  console.log('\n--- Step 3: Deposit ---')
  const commitmentBytes = pad(toHex(commitment), { size: 32 }) as `0x${string}`
  const depositHash = await walletClient.writeContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'deposit',
    args: [commitmentBytes, depositAmount],
  })
  const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositHash })
  console.log('Deposited! Tx:', depositHash)

  // Get leaf index from contract
  const [exists, leafIndex] = await publicClient.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'getCommitmentData',
    args: [commitmentBytes],
  })
  console.log('Leaf index:', leafIndex)

  // Build local merkle tree by syncing from on-chain events
  console.log('\n--- Step 4: Build Merkle Tree (sync from chain) ---')
  const tree = new MerkleTree(MERKLE_DEPTH)

  // Get current block and go back 1000 blocks (or to 0)
  const currentBlock = await publicClient.getBlockNumber()
  const fromBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n
  console.log('Scanning events from block', fromBlock.toString(), 'to', currentBlock.toString())

  // Get all Deposit and NoteCreated events to rebuild the tree
  const depositLogs = await publicClient.getLogs({
    address: POOL_ADDRESS,
    event: {
      type: 'event',
      name: 'Deposit',
      inputs: [
        { name: 'commitment', type: 'bytes32', indexed: true },
        { name: 'amount', type: 'uint256' },
        { name: 'leafIndex', type: 'uint32' },
        { name: 'timestamp', type: 'uint256' },
      ],
    },
    fromBlock,
  })

  const noteCreatedLogs = await publicClient.getLogs({
    address: POOL_ADDRESS,
    event: {
      type: 'event',
      name: 'NoteCreated',
      inputs: [
        { name: 'commitment', type: 'bytes32', indexed: true },
        { name: 'amount', type: 'uint256' },
        { name: 'leafIndex', type: 'uint32' },
      ],
    },
    fromBlock,
  })

  // Combine and sort by leaf index
  const allLeaves: { commitment: bigint; leafIndex: number }[] = []

  for (const log of depositLogs) {
    allLeaves.push({
      commitment: BigInt(log.args.commitment!),
      leafIndex: Number(log.args.leafIndex!),
    })
  }

  for (const log of noteCreatedLogs) {
    allLeaves.push({
      commitment: BigInt(log.args.commitment!),
      leafIndex: Number(log.args.leafIndex!),
    })
  }

  allLeaves.sort((a, b) => a.leafIndex - b.leafIndex)
  console.log('Found', allLeaves.length, 'leaves on chain')

  // Insert all leaves into tree in order
  for (const leaf of allLeaves) {
    tree.insert(leaf.commitment)
  }

  // Find our leaf index
  const ourLeafIndex = allLeaves.findIndex(l => l.commitment === commitment)
  console.log('Our leaf index:', ourLeafIndex)

  const localRoot = tree.getRoot()
  const onChainRoot = await publicClient.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'getLastRoot',
  })

  console.log('Local root:   ', `0x${localRoot.toString(16).padStart(64, '0')}`)
  console.log('On-chain root:', onChainRoot)

  const rootsMatch = `0x${localRoot.toString(16).padStart(64, '0')}`.toLowerCase() === (onChainRoot as string).toLowerCase()
  console.log('Roots match:', rootsMatch)

  if (!rootsMatch) {
    console.error('ERROR: Local and on-chain roots do not match!')
    console.log('Debugging merkle tree...')

    // Debug: print filled subtrees from contract
    for (let i = 0; i < 5; i++) {
      const subtree = await publicClient.readContract({
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: 'filledSubtrees',
        args: [BigInt(i)],
      })
      console.log(`  filledSubtrees[${i}]:`, subtree)
    }
  }

  const isKnownRoot = await publicClient.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'isKnownRoot',
    args: [onChainRoot],
  })
  console.log('Is known root:', isKnownRoot)

  // Get merkle proof for our leaf
  const { path: merklePath, indices: merkleIndices } = tree.getProof(ourLeafIndex)
  console.log('Merkle path length:', merklePath.length)
  console.log('First path element:', `0x${merklePath[0].toString(16).slice(0, 16)}...`)

  // Generate withdraw proof
  console.log('\n--- Step 5: Generate Withdraw Proof ---')
  const nullifierHash = computeNullifierHash(nullifier)
  console.log('Nullifier hash:', `0x${nullifierHash.toString(16)}`)

  // Load circuit and vkey
  const circuit = await import('../src/circuits/withdraw/target/anon_withdraw.json')
  const vkey = await import('../src/circuits/withdraw/target/vk.json')

  // Use on-chain root for the proof
  const rootForProof = BigInt(onChainRoot)

  const { WithdrawVerifier } = await import('../src/withdraw')
  const verifier = new WithdrawVerifier(circuit.default || circuit, vkey.default || vkey)

  const recipientBigInt = BigInt(account.address)

  console.log('Generating proof with inputs:')
  console.log('  secret:', `0x${secret.toString(16).slice(0, 16)}...`)
  console.log('  nullifier:', `0x${nullifier.toString(16).slice(0, 16)}...`)
  console.log('  amount:', depositAmount.toString())
  console.log('  merkle root:', `0x${rootForProof.toString(16)}`)
  console.log('  recipient:', account.address)

  // Generate proof with keccak option for EVM compatibility
  console.log('\n  Generating proof with keccak option for EVM compatibility...')
  const proofData = await verifier.generateSolidityWithdrawProof({
    note: {
      secret,
      nullifier,
      commitment,
      amount: depositAmount,
      leafIndex: ourLeafIndex,
    },
    merklePath,
    merkleIndices,
    merkleRoot: rootForProof,
    recipient: recipientBigInt,
  })
  console.log('  Proof generated!')
  console.log('  Proof length:', proofData.proof.length)
  console.log('  Public inputs:', proofData.publicInputs)

  // Analyze proof format
  const fullProof = new Uint8Array(proofData.proof)
  console.log('\n  Proof analysis:')
  console.log('    Full proof length:', fullProof.length)
  console.log('    First 32 bytes:', Array.from(fullProof.slice(0, 32)))

  // Parse header
  const header = fullProof.slice(0, 4)
  console.log('    Header (first 4 bytes):', Array.from(header))

  // After header
  const afterHeader = fullProof.slice(4)
  console.log('    After header - bytes 0-32 (circuitSize):', '0x' + Buffer.from(afterHeader.slice(0, 32)).toString('hex'))
  console.log('    After header - bytes 32-64 (publicInputsSize):', '0x' + Buffer.from(afterHeader.slice(32, 64)).toString('hex'))
  console.log('    After header - bytes 64-96 (publicInputsOffset):', '0x' + Buffer.from(afterHeader.slice(64, 96)).toString('hex'))

  // Test verification locally first
  console.log('\n--- Step 6: Local Verification ---')
  const localVerifyResult = await verifier.verifyWithdrawProof(proofData)
  console.log('Local verification:', localVerifyResult ? 'PASSED' : 'FAILED')

  // Test on-chain verifier directly
  console.log('\n--- Step 7: On-chain Verifier Test ---')
  const withdrawVerifierAddress = await publicClient.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'withdrawVerifier',
  })
  console.log('Withdraw verifier address:', withdrawVerifierAddress)

  // Prepare public inputs for verifier
  const nullifierHashBytes = pad(toHex(nullifierHash), { size: 32 }) as `0x${string}`
  const rootBytes = pad(toHex(rootForProof), { size: 32 }) as `0x${string}`
  const amountBytes = pad(toHex(depositAmount), { size: 32 }) as `0x${string}`
  const recipientBytes = pad(toHex(recipientBigInt), { size: 32 }) as `0x${string}`

  const publicInputsForVerifier = [nullifierHashBytes, rootBytes, amountBytes, recipientBytes]
  console.log('Public inputs for verifier:')
  console.log('  [0] nullifierHash:', nullifierHashBytes)
  console.log('  [1] root:', rootBytes)
  console.log('  [2] amount:', amountBytes)
  console.log('  [3] recipient:', recipientBytes)

  // The Solidity verifier expects the raw proof bytes (14080 bytes for this circuit)
  // Do NOT strip any headers or use splitHonkProof - use raw proof directly
  console.log('\n  Proof format:')
  console.log('    Raw proof length:', fullProof.length)
  console.log('    Expected by verifier: 14080 (440 * 32)')

  // Use raw proof directly - Solidity verifier expects full proof
  const proofForSolidity = fullProof

  console.log('    Using raw proof')
  console.log('    Length:', proofForSolidity.length)
  console.log('    First 32 bytes:', '0x' + Buffer.from(proofForSolidity.slice(0, 32)).toString('hex'))

  // Helper to log detailed viem error and exit
  function handleViemError(context: string, err: any): never {
    console.error('\n========== VIEM ERROR ==========')
    console.error('Context:', context)
    console.error('Error name:', err.name)
    console.error('Short message:', err.shortMessage)
    // Try to decode known errors
    if (err.message?.includes('0x09bde339')) {
      console.error('Decoded error: InvalidProof()')
    } else if (err.message?.includes('0x')) {
      const match = err.message.match(/0x[0-9a-fA-F]{8}/)
      if (match) {
        console.error('Error selector:', match[0])
      }
    }
    console.error('================================\n')
    process.exit(1)
  }

  // Test on-chain verification
  console.log('\nTesting on-chain verification...')
  try {
    const onChainVerifyResult = await publicClient.readContract({
      address: withdrawVerifierAddress,
      abi: VERIFIER_ABI,
      functionName: 'verify',
      args: [toHex(proofForSolidity), publicInputsForVerifier],
    })
    console.log('On-chain verifier result:', onChainVerifyResult)
  } catch (err: any) {
    handleViemError('On-chain verifier', err)
  }

  // Execute withdraw
  console.log('\n--- Step 8: Withdraw ---')
  try {
    const withdrawHash = await walletClient.writeContract({
      address: POOL_ADDRESS,
      abi: POOL_ABI,
      functionName: 'withdraw',
      args: [
        toHex(proofForSolidity),
        nullifierHashBytes,
        rootBytes,
        depositAmount,
        account.address,
      ],
    })
    const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash })
    console.log('Withdraw successful! Tx:', withdrawHash)

    // Check final balance
    const finalBalance = await publicClient.readContract({
      address: ANON_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    })
    console.log('Final token balance:', formatUnits(finalBalance, 18), 'ANON')
  } catch (err: any) {
    handleViemError('Withdraw call', err)
  }

  console.log('\n=== Test Complete ===')
  process.exit(0)
}

main().catch((err) => {
  console.error('\n========== UNHANDLED ERROR ==========')
  console.error(err)
  console.error('=====================================\n')
  process.exit(1)
})
