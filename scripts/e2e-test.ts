/**
 * End-to-end test script that tests all APIs:
 * 1. POST /api/upload - Upload an image
 * 2. Generate ZK proof (client-side, same as browser would)
 * 3. POST /api/post - Create a cast with image and embed
 *
 * Use `bun run cast:delete <hash>` to clean up after verifying.
 */

import { hashMessage } from 'viem'
import { AnonBalanceVerifier, BALANCE_THRESHOLDS } from '../packages/credentials/src/verifier'

const API_URL = process.env.API_URL || 'http://localhost:3000'
const TEST_ADDRESS = process.env.TEST_ADDRESS
const TEST_SIGNATURE = process.env.TEST_SIGNATURE

// Test image URL (random sample image)
const TEST_IMAGE_URL = 'https://picsum.photos/400/300'

async function testUpload(): Promise<string | null> {
  console.log('\n--- Testing /api/upload ---')

  // Fetch a random image from picsum
  console.log('Fetching test image from picsum.photos...')
  const imageResponse = await fetch(TEST_IMAGE_URL)
  if (!imageResponse.ok) {
    console.log('Failed to fetch test image')
    return null
  }

  const imageBlob = await imageResponse.blob()
  const formData = new FormData()
  formData.append('file', imageBlob, 'test.jpg')

  const response = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    console.log('Upload API error:', error)
    return null
  }

  const data = await response.json()
  console.log('Upload successful:', data.url)
  return data.url
}

async function testProve(): Promise<{ proof: any; balance: string }> {
  console.log('\n--- Generating ZK proof (client-side) ---')

  if (!TEST_ADDRESS || !TEST_SIGNATURE) {
    throw new Error('Missing TEST_ADDRESS or TEST_SIGNATURE')
  }

  const verifier = new AnonBalanceVerifier()

  // Build input with storage proof from chain
  console.log('Fetching storage proof for:', TEST_ADDRESS)
  const { input } = await verifier.buildInput(TEST_ADDRESS, BALANCE_THRESHOLDS.POST)

  const storageValue = input.storageProof[0].value
  if (storageValue < BALANCE_THRESHOLDS.POST) {
    throw new Error(`Insufficient balance: ${storageValue.toString()}`)
  }

  console.log('Balance:', storageValue.toString())
  console.log('Generating proof (this takes ~8 seconds)...')

  const proof = await verifier.generateProof({
    ...input,
    signature: TEST_SIGNATURE,
    messageHash: hashMessage('test'),
  })

  console.log('Proof generated successfully')
  return {
    proof: { proof: proof.proof, publicInputs: proof.publicInputs },
    balance: storageValue.toString(),
  }
}

async function testPost(
  proof: any,
  imageUrl: string | null
): Promise<{ hash: string; fid: number }> {
  console.log('\n--- Testing /api/post ---')

  const postData: any = {
    proof,
    text: `test ${new Date().toISOString()}`,
  }

  if (imageUrl) {
    postData.images = [imageUrl]
  }

  // Add a test embed (link to example.com)
  postData.embeds = ['https://example.com']

  const response = await fetch(`${API_URL}/api/post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postData),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Post API error: ${JSON.stringify(error)}`)
  }

  const data = await response.json()
  console.log('Post created successfully!')
  console.log('Hash:', data.hash)
  console.log('FID:', data.fid)
  console.log('Tier:', data.tier)
  console.log('Warpcast URL:', `https://warpcast.com/~/conversations/${data.hash}`)

  return { hash: data.hash, fid: data.fid }
}

async function main() {
  console.log('=== Anon E2E Test ===')
  console.log('API URL:', API_URL)
  console.log('Test Address:', TEST_ADDRESS)

  const results = {
    upload: false,
    prove: false,
    post: false,
  }

  let castHash: string | null = null

  try {
    // Test 1: Upload
    let imageUrl: string | null = null
    try {
      imageUrl = await testUpload()
      results.upload = imageUrl !== null
    } catch (err) {
      console.error('Upload test failed:', err)
    }

    // Test 2: Prove
    const { proof } = await testProve()
    results.prove = true

    // Test 3: Post
    const { hash } = await testPost(proof, imageUrl)
    results.post = true
    castHash = hash
  } catch (err) {
    console.error('\nTest failed:', err)
  }

  // Summary
  console.log('\n=== Test Results ===')
  console.log('Upload:', results.upload ? 'PASS' : 'SKIP/FAIL')
  console.log('Prove:', results.prove ? 'PASS' : 'FAIL')
  console.log('Post:', results.post ? 'PASS' : 'FAIL')

  const passed = results.prove && results.post
  console.log('\nOverall:', passed ? 'PASS' : 'FAIL')

  if (castHash) {
    console.log('\n--- Cleanup ---')
    console.log('To delete the test cast, run:')
    console.log(`  bun run cast:delete ${castHash}`)
  }

  process.exit(passed ? 0 : 1)
}

main()
