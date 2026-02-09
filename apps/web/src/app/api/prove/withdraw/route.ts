import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, mkdir, rm, copyFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { computeNullifierHash } from '@anon/sdk/core'

const execAsync = promisify(exec)

// Path to the circuit directory (relative to apps/web)
const CIRCUIT_DIR = join(process.cwd(), '../../packages/protocol/circuits/withdraw')

// BN254 field modulus - all values must be less than this
const FIELD_MODULUS = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
)

// Ensure a bigint is within the BN254 field
function toField(value: bigint): bigint {
  const v = value < 0n ? -value : value
  return v >= FIELD_MODULUS ? v % FIELD_MODULUS : v
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
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Step 1: Generate witness using nargo
    const witnessStartTime = performance.now()

    const { stdout: _nargoOut, stderr: _nargoErr } = await execAsync(
      `cd ${workDir} && nargo execute witness`,
      { timeout: 30000 }
    )

    const witnessGenTime = performance.now() - witnessStartTime
    const witnessPath = join(workDir, 'target/witness.gz')

    // Step 2: Generate proof using bb
    const proofStartTime = performance.now()

    const proofOutputDir = join(workDir, 'proof_output')
    await mkdir(proofOutputDir, { recursive: true })
    const bytecodePath = join(workDir, 'target/anon_withdraw.json')

    // Also write the verification key for verification
    const _vkPath = join(CIRCUIT_DIR, 'target/vk')

    const { stdout: _bbOut, stderr: _bbErr } = await execAsync(
      `bb prove -s ultra_honk --oracle_hash keccak --output_format bytes -b ${bytecodePath} -w ${witnessPath} -o ${proofOutputDir} --write_vk`,
      { timeout: 120000 }
    )

    const proofGenerationTime = performance.now() - proofStartTime

    // Read the proof from the output directory (bb writes to proof_output/proof)
    const rawProofBytes = await readFile(join(proofOutputDir, 'proof'))

    // Native bb CLI outputs: 4-byte header + public inputs + proof
    // The header is 4 bytes, public inputs are 4 * 32 = 128 bytes
    // We need to strip these to get the raw 14080-byte proof for Solidity
    const HEADER_SIZE = 4
    const PUBLIC_INPUTS_SIZE = 4 * 32 // 4 public inputs, each 32 bytes
    const EXPECTED_PROOF_SIZE = 440 * 32 // 14080 bytes

    // Strip header and public inputs to get just the proof
    const proofBytes = rawProofBytes.slice(HEADER_SIZE + PUBLIC_INPUTS_SIZE)
    const proof = Array.from(proofBytes)

    if (proof.length !== EXPECTED_PROOF_SIZE) {
      throw new Error(`Proof size mismatch: got ${proof.length}, expected ${EXPECTED_PROOF_SIZE}`)
    }

    // Verify the proof locally to ensure it's valid before returning
    await execAsync(
      `bb verify -s ultra_honk --oracle_hash keccak -k ${join(proofOutputDir, 'vk')} -p ${join(proofOutputDir, 'proof')}`,
      { timeout: 30000 }
    )

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
  } catch (error: unknown) {
    console.error('[API] Proof generation error:', error)
    const execError = error as { stdout?: string; stderr?: string }

    // Clean up on error
    try {
      await rm(workDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Proof generation failed',
        details: execError.stderr || execError.stdout,
      },
      { status: 500 }
    )
  }
}
