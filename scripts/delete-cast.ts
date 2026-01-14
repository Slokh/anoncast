const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY
const NEYNAR_SIGNER_UUID = process.env.NEYNAR_SIGNER_UUID

async function main() {
  const hash = process.argv[2]

  if (!hash) {
    console.error('Usage: bun run scripts/delete-cast.ts <cast-hash>')
    process.exit(1)
  }

  if (!NEYNAR_API_KEY || !NEYNAR_SIGNER_UUID) {
    console.error('Missing NEYNAR_API_KEY or NEYNAR_SIGNER_UUID environment variables')
    process.exit(1)
  }

  console.log('Deleting cast:', hash)

  const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-KEY': NEYNAR_API_KEY,
    },
    body: JSON.stringify({
      signer_uuid: NEYNAR_SIGNER_UUID,
      target_hash: hash,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Neynar API error:', error)
    process.exit(1)
  }

  console.log('Cast deleted successfully!')
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
