import { describe, test, expect } from 'bun:test'
import { hashMessage } from 'viem'
import {
  AnonBalanceVerifier,
  getVerifier,
  ANON_TOKEN,
  BALANCE_THRESHOLDS,
} from './verifier'

describe('AnonBalanceVerifier - Unit Tests', () => {
  test('should export correct token configuration', () => {
    expect(ANON_TOKEN.address).toBe('0x0Db510e79909666d6dEc7f5e49370838c16D950f')
    expect(ANON_TOKEN.chainId).toBe(8453) // Base
    expect(ANON_TOKEN.balanceSlot).toBe(0)
    expect(ANON_TOKEN.decimals).toBe(18)
  })

  test('should export correct balance thresholds', () => {
    // 5,000 tokens with 18 decimals
    expect(BALANCE_THRESHOLDS.POST).toBe(BigInt('5000000000000000000000'))
    // 2,000,000 tokens with 18 decimals
    expect(BALANCE_THRESHOLDS.PROMOTE).toBe(BigInt('2000000000000000000000000'))
  })

  test('should return singleton verifier instance', () => {
    const verifier1 = getVerifier()
    const verifier2 = getVerifier()
    expect(verifier1).toBe(verifier2)
  })

  test('canPost returns correct values', () => {
    const verifier = new AnonBalanceVerifier()

    // Below threshold
    expect(verifier.canPost(BigInt('4999000000000000000000'))).toBe(false)

    // At threshold
    expect(verifier.canPost(BigInt('5000000000000000000000'))).toBe(true)

    // Above threshold
    expect(verifier.canPost(BigInt('10000000000000000000000'))).toBe(true)
  })

  test('canPromote returns correct values', () => {
    const verifier = new AnonBalanceVerifier()

    // Below threshold
    expect(verifier.canPromote(BigInt('1999999000000000000000000'))).toBe(false)

    // At threshold
    expect(verifier.canPromote(BigInt('2000000000000000000000000'))).toBe(true)

    // Above threshold
    expect(verifier.canPromote(BigInt('3000000000000000000000000'))).toBe(true)
  })
})

describe('AnonBalanceVerifier - Network Tests', () => {
  test('buildInput fetches storage proof from Base', async () => {
    const verifier = new AnonBalanceVerifier()

    // Use an address that holds some $ANON (found via on-chain lookup)
    const testAddress = '0x0000000000000000000000000000000000000001'
    const result = await verifier.buildInput(testAddress, BigInt(0))

    expect(result.input.chainId).toBe('0x2105') // 8453 in hex
    expect(result.input.tokenAddress).toBe(ANON_TOKEN.address)
    expect(result.input.storageHash).toBeDefined()
    expect(result.input.storageHash).toMatch(/^0x[a-fA-F0-9]{64}$/)
    expect(result.input.storageProof).toBeDefined()
    expect(result.input.storageProof.length).toBeGreaterThan(0)
    expect(result.message).toBeDefined()

    // Verify the proof structure
    const proof = result.input.storageProof[0]
    expect(proof.proof.length).toBeGreaterThan(0)
    console.log('Storage proof depth:', proof.proof.length)
    console.log('Storage value:', proof.value.toString())
  }, 30000)
})

describe('AnonBalanceVerifier - Proof Tests', () => {
  // These tests require a valid signature from a wallet that holds $ANON
  // To run: set TEST_SIGNATURE and TEST_ADDRESS environment variables
  // The signature should be over the message 'test' (using hashMessage('test'))
  //
  // NOTE: The old test address 0xe4dd432fe405891ab0118760e3116e371188a1eb
  // no longer holds $ANON tokens. You need to provide credentials from
  // a wallet that currently holds tokens.

  const testSignature = process.env.TEST_SIGNATURE
  const testAddress = process.env.TEST_ADDRESS

  const shouldRunProofTests = testSignature && testAddress

  test.skipIf(!shouldRunProofTests)('generates and verifies proof end-to-end', async () => {
    const verifier = new AnonBalanceVerifier()

    // Build input with storage proof from chain
    // Note: We use a fixed message 'test' to match the pre-generated signature
    const { input } = await verifier.buildInput(testAddress!, BigInt(1))

    // Check if the address actually has a balance
    const storageValue = input.storageProof[0].value
    if (storageValue === BigInt(0)) {
      console.log('⚠️  Test address has 0 balance - skipping proof generation')
      console.log('    To run this test, provide TEST_ADDRESS with $ANON tokens')
      return
    }

    console.log('Balance:', storageValue.toString())
    console.log('Generating proof...')
    console.time('generateProof')

    // Generate proof using the test signature (signed over 'test' message)
    const proof = await verifier.generateProof({
      ...input,
      signature: testSignature!,
      messageHash: hashMessage('test'),
    })

    console.timeEnd('generateProof')

    expect(proof.proof).toBeDefined()
    expect(proof.proof.length).toBeGreaterThan(0)
    expect(proof.publicInputs).toBeDefined()

    console.log('Verifying proof...')
    console.time('verifyProof')

    // Verify the proof
    const verified = await verifier.verifyProof(proof)

    console.timeEnd('verifyProof')

    expect(verified).toBe(true)

    // Parse and validate the public data
    const data = verifier.parseData(proof.publicInputs)
    expect(data.chainId).toBe(ANON_TOKEN.chainId)

    console.log('Proof verified! Data:', data)
  }, 300000)

  // If no test credentials, just log instructions
  test.skipIf(shouldRunProofTests)('instructions for running proof tests', () => {
    console.log(`
To run proof generation tests, you need a wallet that holds $ANON tokens.

1. Get the message to sign:
   const verifier = new AnonBalanceVerifier()
   const { message } = await verifier.buildInput(YOUR_ADDRESS, BigInt(1))

2. Sign the message with your wallet (e.g., using ethers or viem)

3. Run tests with environment variables:
   TEST_ADDRESS=0x... TEST_SIGNATURE=0x... bun test

Note: The signature must be from the wallet at TEST_ADDRESS which must hold $ANON tokens.
    `)
  })
})
