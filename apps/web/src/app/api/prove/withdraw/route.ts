import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, mkdir, rm, copyFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { keccak256, toHex, pad } from 'viem'

const execAsync = promisify(exec)

// Path to the circuit directory (relative to apps/web)
const CIRCUIT_DIR = join(process.cwd(), '../../packages/pool/src/circuits/withdraw')

// BN254 field modulus - all values must be less than this
const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617')

// Ensure a bigint is within the BN254 field
function toField(value: bigint): bigint {
  const v = value < 0n ? -value : value
  return v >= FIELD_MODULUS ? v % FIELD_MODULUS : v
}

// Compute nullifier hash (keccak256) - must match circuit implementation
// Reduces result modulo field to ensure it's valid for the circuit
function computeNullifierHash(nullifier: bigint): bigint {
  const nullifierBytes = pad(toHex(nullifier), { size: 32 })
  const hash = keccak256(nullifierBytes)
  // Reduce modulo field to ensure it fits within BN254
  return toField(BigInt(hash))
}

// Format a bigint as a hex string for Prover.toml
function toTomlHex(value: bigint): string {
  // Ensure value is within field before formatting
  const fieldValue = toField(value)
  return `"0x${fieldValue.toString(16)}"`
}

export async function POST(request: NextRequest) {
  const startTime = performance.now()
  const workId = randomUUID().slice(0, 8)
  const workDir = join(tmpdir(), `anon-prove-${workId}`)

  try {
    const body = await request.json()

    // Validate required fields
    const { note, merklePath, merkleIndices, merkleRoot, recipient } = body
    if (!note || !merklePath || !merkleIndices || !merkleRoot || !recipient) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Convert string values back to BigInt and ensure within field
    const secret = toField(BigInt(note.secret))
    const nullifier = toField(BigInt(note.nullifier))
    const amount = toField(BigInt(note.amount))
    const merkleRootBigInt = toField(BigInt(merkleRoot))
    const recipientBigInt = toField(BigInt(recipient))
    const merklePathBigInt = merklePath.map((p: string) => toField(BigInt(p)))
    const merkleIndicesNum = merkleIndices.map((i: number) => Number(i))

    // Compute derived values
    const nullifierHash = computeNullifierHash(nullifier)

    // Create work directory structure matching nargo expectations
    await mkdir(join(workDir, 'src'), { recursive: true })
    await mkdir(join(workDir, 'target'), { recursive: true })

    // Copy necessary files
    await copyFile(join(CIRCUIT_DIR, 'Nargo.toml'), join(workDir, 'Nargo.toml'))
    await copyFile(join(CIRCUIT_DIR, 'src/main.nr'), join(workDir, 'src/main.nr'))
    await copyFile(
      join(CIRCUIT_DIR, 'target/anon_withdraw.json'),
      join(workDir, 'target/anon_withdraw.json')
    )

    // Generate Prover.toml content
    const proverToml = `secret = ${toTomlHex(secret)}
nullifier = ${toTomlHex(nullifier)}
amount = ${toTomlHex(amount)}
merkle_path = [${merklePathBigInt.map(toTomlHex).join(', ')}]
merkle_indices = [${merkleIndicesNum.join(', ')}]
nullifier_hash = ${toTomlHex(nullifierHash)}
merkle_root = ${toTomlHex(merkleRootBigInt)}
withdraw_amount = ${toTomlHex(amount)}
recipient = ${toTomlHex(recipientBigInt)}
`

    // Write Prover.toml to work directory
    await writeFile(join(workDir, 'Prover.toml'), proverToml)

    console.log(`[API] Work dir: ${workDir}`)
    console.log(`[API] Prover.toml:\n${proverToml}`)

    // Step 1: Generate witness using nargo
    console.log('[API] Generating witness with nargo...')
    const witnessStartTime = performance.now()

    const { stdout: nargoOut, stderr: nargoErr } = await execAsync(
      `cd ${workDir} && nargo execute witness`,
      { timeout: 30000 }
    )

    if (nargoErr && !nargoErr.includes('Witness saved')) {
      console.log('[API] nargo stderr:', nargoErr)
    }

    const witnessGenTime = performance.now() - witnessStartTime
    console.log(`[API] Witness generated in ${witnessGenTime.toFixed(0)}ms`)

    const witnessPath = join(workDir, 'target/witness.gz')

    // Step 2: Generate proof using bb
    console.log('[API] Generating proof with bb...')
    const proofStartTime = performance.now()

    const proofOutputDir = join(workDir, 'proof_output')
    await mkdir(proofOutputDir, { recursive: true })
    const bytecodePath = join(workDir, 'target/anon_withdraw.json')

    // Also write the verification key for verification
    const vkPath = join(CIRCUIT_DIR, 'target/vk')

    const { stdout: bbOut, stderr: bbErr } = await execAsync(
      `bb prove -s ultra_honk --oracle_hash keccak --output_format bytes -b ${bytecodePath} -w ${witnessPath} -o ${proofOutputDir} --write_vk`,
      { timeout: 120000 }
    )

    if (bbErr) {
      console.log('[API] bb stderr:', bbErr)
    }

    const proofGenerationTime = performance.now() - proofStartTime
    console.log(`[API] Proof generated in ${proofGenerationTime.toFixed(0)}ms`)

    // Read the proof from the output directory (bb writes to proof_output/proof)
    const rawProofBytes = await readFile(join(proofOutputDir, 'proof'))

    // Native bb CLI outputs: 4-byte header + public inputs + proof
    // The header is 4 bytes, public inputs are 4 * 32 = 128 bytes
    // We need to strip these to get the raw 14080-byte proof for Solidity
    const HEADER_SIZE = 4
    const PUBLIC_INPUTS_SIZE = 4 * 32  // 4 public inputs, each 32 bytes
    const EXPECTED_PROOF_SIZE = 440 * 32  // 14080 bytes

    console.log(`[API] Raw bb output size: ${rawProofBytes.length} bytes`)
    console.log(`[API] Expected: ${HEADER_SIZE} + ${PUBLIC_INPUTS_SIZE} + ${EXPECTED_PROOF_SIZE} = ${HEADER_SIZE + PUBLIC_INPUTS_SIZE + EXPECTED_PROOF_SIZE}`)

    // Strip header and public inputs to get just the proof
    const proofBytes = rawProofBytes.slice(HEADER_SIZE + PUBLIC_INPUTS_SIZE)
    const proof = Array.from(proofBytes)

    console.log(`[API] Stripped proof size: ${proof.length} bytes (expected: ${EXPECTED_PROOF_SIZE})`)

    if (proof.length !== EXPECTED_PROOF_SIZE) {
      throw new Error(`Proof size mismatch: got ${proof.length}, expected ${EXPECTED_PROOF_SIZE}`)
    }

    console.log(`[API] First 64 bytes: ${proof.slice(0, 64).join(',')}`)
    console.log(`[API] Last 64 bytes: ${proof.slice(-64).join(',')}`)

    // Verify the proof locally to ensure it's valid
    console.log('[API] Verifying proof locally...')
    const { stdout: verifyOut, stderr: verifyErr } = await execAsync(
      `bb verify -s ultra_honk --oracle_hash keccak -k ${join(proofOutputDir, 'vk')} -p ${join(proofOutputDir, 'proof')}`,
      { timeout: 30000 }
    )
    console.log('[API] Verification result:', verifyOut || 'success')
    if (verifyErr) {
      console.log('[API] Verification stderr:', verifyErr)
    }

    // Clean up work directory
    await rm(workDir, { recursive: true, force: true })

    const totalTime = performance.now() - startTime

    // Public inputs in order expected by contract
    const publicInputs = [
      `0x${nullifierHash.toString(16)}`,
      `0x${merkleRootBigInt.toString(16)}`,
      `0x${amount.toString(16)}`,
      `0x${recipientBigInt.toString(16)}`,
    ]

    return NextResponse.json({
      success: true,
      proof,
      publicInputs,
      timing: {
        verifierLoadTime: 0,
        witnessGenTime,
        proofGenerationTime,
        totalTime,
      },
    })
  } catch (error: any) {
    console.error('[API] Proof generation error:', error)
    console.error('[API] stdout:', error.stdout)
    console.error('[API] stderr:', error.stderr)

    // Clean up on error
    try {
      await rm(workDir, { recursive: true, force: true })
    } catch {}

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Proof generation failed',
        details: error.stderr || error.stdout,
      },
      { status: 500 }
    )
  }
}
