import https from 'node:https'
import { TwitterApi, type SendTweetV2Params } from 'twitter-api-v2'

type TweetResult =
  | { success: true; tweetId: string }
  | { success: false; error?: string; rateLimitReset?: number }

class TwitterService {
  private client: TwitterApi | null = null
  private static instance: TwitterService | null = null

  private constructor() {}

  static getInstance(): TwitterService {
    if (!TwitterService.instance) {
      TwitterService.instance = new TwitterService()
    }
    return TwitterService.instance
  }

  private getClient(): TwitterApi {
    if (!this.client) {
      const appKey = process.env.TWITTER_API_KEY
      const appSecret = process.env.TWITTER_API_SECRET
      const accessToken = process.env.TWITTER_ACCESS_TOKEN
      const accessSecret = process.env.TWITTER_ACCESS_SECRET

      if (!appKey || !appSecret || !accessToken || !accessSecret) {
        throw new Error('Twitter API credentials are not configured')
      }

      this.client = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      })
    }
    return this.client
  }

  async uploadMedia(imageUrl: string): Promise<string> {
    const { data: binaryData, mimeType } = await new Promise<{
      data: Buffer
      mimeType: string
    }>((resolve, reject) => {
      https
        .get(imageUrl, (res) => {
          res.setEncoding('binary')
          let data = Buffer.alloc(0)

          res.on('data', (chunk) => {
            data = Buffer.concat([data, Buffer.from(chunk, 'binary')])
          })
          res.on('end', () => {
            const mimeType = res.headers['content-type'] || 'image/jpeg'
            resolve({ data, mimeType })
          })
        })
        .on('error', (e) => {
          reject(e)
        })
    })

    const client = this.getClient()
    return await client.v1.uploadMedia(binaryData as unknown as Buffer, {
      mimeType,
    })
  }

  async deleteTweet(tweetId: string): Promise<{ success: boolean }> {
    const client = this.getClient()
    await client.v2.deleteTweet(tweetId)
    return { success: true }
  }

  async postTweet(args: {
    text: string
    images?: string[]
    quoteTweetId?: string
    replyToTweetId?: string
  }): Promise<TweetResult> {
    try {
      const client = this.getClient()

      // Upload images if provided
      const mediaIds: string[] = []
      if (args.images && args.images.length > 0) {
        for (const image of args.images.slice(0, 4)) {
          const mediaId = await this.uploadMedia(image)
          mediaIds.push(mediaId)
        }
      }

      const params: SendTweetV2Params = {}

      if (mediaIds.length > 0) {
        params.media = {
          media_ids: mediaIds.slice(0, 4) as [string, string, string, string],
        }
      }

      if (args.quoteTweetId) {
        params.quote_tweet_id = args.quoteTweetId
      }

      if (args.replyToTweetId) {
        params.reply = {
          in_reply_to_tweet_id: args.replyToTweetId,
        }
      }

      const result = await client.v2.tweet(args.text, params)

      if (result?.data?.id) {
        return { success: true, tweetId: result.data.id }
      }

      return { success: false, error: 'No tweet ID returned' }
    } catch (e) {
      const error = e as Error & {
        data?: { detail?: string }
        rateLimit?: { reset?: number }
      }

      if (
        error.data?.detail ===
        'You attempted to reply to a Tweet that is deleted or not visible to you.'
      ) {
        return { success: false, error: 'Tweet not found or not visible' }
      }

      return {
        success: false,
        error: error.message,
        rateLimitReset: error.rateLimit?.reset,
      }
    }
  }
}

export function getTwitter(): TwitterService {
  return TwitterService.getInstance()
}
