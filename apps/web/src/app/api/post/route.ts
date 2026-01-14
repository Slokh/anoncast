import { NextRequest, NextResponse } from 'next/server'
import { getVerifier, BALANCE_THRESHOLDS, type ProofData } from '@anon/credentials'
import { getNeynar } from '@/services/neynar'
import { getTwitter } from '@/services/twitter'

type PostRequest = {
  proof: ProofData
  text: string
  images?: string[]
  embeds?: string[]
}

// Content that cannot be promoted to Twitter
const UNABLE_TO_PROMOTE_PATTERNS = [
  /@clanker.*(launch|deploy|make)/i,
  /.*dexscreener.com.*/i,
  /.*dextools.io.*/i,
  /.*0x[a-fA-F0-9]{40}.*/i,
  /(^|\s)\$(?!ANON\b)[a-zA-Z]+\b/i,
  /.*@bankr.*/i,
]

function canPromoteContent(text: string, embedUrls: string[]): boolean {
  if (UNABLE_TO_PROMOTE_PATTERNS.some((regex) => text.match(regex))) {
    return false
  }
  if (embedUrls.some((url) => UNABLE_TO_PROMOTE_PATTERNS.some((regex) => url.match(regex)))) {
    return false
  }
  return true
}

function extractTweetId(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    const isTwitter =
      (parsed.hostname === 'x.com' || parsed.hostname === 'twitter.com') &&
      parsed.pathname.match(/^\/[^/]+\/status\/\d+$/)
    if (isTwitter) {
      return parsed.pathname.split('/').pop()
    }
  } catch {
    // Invalid URL
  }
  return undefined
}

export async function POST(request: NextRequest) {
  try {
    const body: PostRequest = await request.json()

    if (!body.proof || !body.text) {
      return NextResponse.json(
        { error: 'Missing required fields: proof and text' },
        { status: 400 }
      )
    }

    if (body.text.length > 320) {
      return NextResponse.json(
        { error: 'Text exceeds maximum length of 320 characters' },
        { status: 400 }
      )
    }

    const verifier = getVerifier()

    // Verify the ZK proof
    const isValid = await verifier.verifyProof(body.proof)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid proof' }, { status: 401 })
    }

    // Parse proof data and check balance threshold
    const data = verifier.parseData(body.proof.publicInputs)
    const balance = BigInt(data.balance)

    if (balance < BALANCE_THRESHOLDS.POST) {
      return NextResponse.json(
        {
          error: `Insufficient balance. Required: ${BALANCE_THRESHOLDS.POST.toString()}, got: ${balance.toString()}`,
        },
        { status: 403 }
      )
    }

    // Determine balance tier
    const canPromote = balance >= BALANCE_THRESHOLDS.PROMOTE

    // Post to Farcaster
    const neynar = getNeynar()
    const castResult = await neynar.createCast({
      text: body.text,
      images: body.images,
      embeds: body.embeds,
    })

    if (!castResult.success) {
      return NextResponse.json({ error: 'Failed to create cast' }, { status: 500 })
    }

    // Auto-crosspost to Twitter if user has 2M+ $ANON
    let tweetId: string | undefined
    let tweetUrl: string | undefined

    if (canPromote) {
      const embedUrls = body.embeds || []
      const shouldPromote = canPromoteContent(body.text, embedUrls)

      if (shouldPromote) {
        try {
          // Prepare tweet content
          let tweetText = body.text
          const images: string[] = body.images || []
          let quoteTweetId: string | undefined

          // Process embeds for Twitter
          for (const embedUrl of embedUrls) {
            // Check if it's a Twitter/X link - use as quote tweet
            const extractedTweetId = extractTweetId(embedUrl)
            if (extractedTweetId) {
              if (!quoteTweetId) {
                quoteTweetId = extractedTweetId
              }
              continue
            }

            // Check if it's a Farcaster cast - convert to cast image
            if (embedUrl.includes('warpcast.com')) {
              const hashMatch = embedUrl.match(/0x[a-f0-9]+$/)
              if (hashMatch) {
                images.push(`https://client.warpcast.com/v2/cast-image?castHash=${hashMatch[0]}`)
                continue
              }
            }

            // Add other links to the tweet text
            tweetText += `\n\n${embedUrl}`
          }

          // Convert @mentions from Farcaster usernames to Twitter handles
          const mentions = tweetText.match(/@[\w-]+(?:\.eth)?/g)
          if (mentions) {
            for (const mention of mentions) {
              try {
                const farcasterUser = await neynar.getUserByUsername(mention.slice(1))
                if (farcasterUser.user) {
                  const connectedTwitter = farcasterUser.user.verified_accounts?.find(
                    (va) => va.platform === 'x'
                  )
                  if (connectedTwitter) {
                    tweetText = tweetText.replace(mention, `@${connectedTwitter.username}`)
                  }
                }
              } catch {
                // Keep original mention
              }
            }
          }

          // Post to Twitter
          const twitter = getTwitter()
          const twitterResult = await twitter.postTweet({
            text: tweetText,
            images: images.slice(0, 4),
            quoteTweetId,
          })

          if (twitterResult.success) {
            tweetId = twitterResult.tweetId
            tweetUrl = `https://x.com/i/status/${tweetId}`
          }
        } catch {
          // Silently fail - Farcaster post succeeded
        }
      }
    }

    return NextResponse.json({
      success: true,
      hash: castResult.cast.hash,
      fid: castResult.cast.author.fid,
      tier: canPromote ? 'promote' : 'post',
      balance: balance.toString(),
      tweetId,
      tweetUrl,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
