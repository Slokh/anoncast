# anoncast

Post anonymously to Farcaster and X using zero-knowledge proofs.

## How it works

anoncast uses ZK proofs to verify you hold $ANON tokens without revealing your wallet address. This allows truly anonymous posting while preventing spam through token-gating.

### Holder Requirements

- **5,000 $ANON** - Post to Farcaster
- **2,000,000 $ANON** - Auto-crosspost to X

## Tech Stack

- **Frontend**: Next.js 15, React, Tailwind CSS
- **Wallet**: RainbowKit, wagmi
- **ZK Proofs**: Noir circuits for balance verification
- **Farcaster**: Neynar API
- **Twitter/X**: twitter-api-v2

## Project Structure

```
├── apps/
│   └── web/                 # Next.js frontend
│       ├── src/
│       │   ├── app/         # App router pages & API routes
│       │   ├── components/  # React components
│       │   └── services/    # Neynar & Twitter integrations
│       └── public/          # Static assets
└── packages/
    └── credentials/         # ZK proof generation & verification
        └── src/
            ├── circuit/     # Noir circuit for balance proofs
            └── verifier.ts  # Proof verification logic
```

## Development

```bash
# Install dependencies
bun install

# Run the development server
bun run dev
```

## Environment Variables

Create a `.env.local` file in `apps/web/`:

```env
# Neynar (Farcaster)
NEYNAR_API_KEY=
NEYNAR_SIGNER_UUID=

# Twitter/X
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_SECRET=

# Image uploads
UPLOAD_API_KEY=
```

## Links

- [X (@anoncast_)](https://x.com/anoncast_)
- [Farcaster (@anoncast)](https://warpcast.com/anoncast)
- [Buy $ANON](https://app.uniswap.org/swap?outputCurrency=0x0Db510e79909666d6dEc7f5e49370838c16D950f&chain=base)

## License

MIT
