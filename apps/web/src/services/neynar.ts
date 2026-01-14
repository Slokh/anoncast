type CastResponse =
  | { success: false }
  | {
      success: true
      cast: {
        hash: string
        author: {
          fid: number
        }
      }
    }

export type FarcasterCast = {
  hash: string
  text: string
  timestamp: string
  author: {
    fid: number
    username: string
    display_name: string
    pfp_url: string
  }
  embeds: Array<{
    url?: string
    metadata?: {
      image?: string
      html?: {
        ogTitle?: string
        ogDescription?: string
        ogImage?: Array<{ url: string; alt?: string }>
      }
    }
  }>
  reactions: {
    likes_count: number
    recasts_count: number
  }
  replies: {
    count: number
  }
  parent_hash?: string
}

class NeynarService {
  private readonly apiKey: string
  private readonly signerUuid: string
  private readonly baseUrl = 'https://api.neynar.com/v2'
  private static instance: NeynarService | null = null

  private constructor(apiKey: string, signerUuid: string) {
    this.apiKey = apiKey
    this.signerUuid = signerUuid
  }

  static getInstance(): NeynarService {
    if (!NeynarService.instance) {
      const apiKey = process.env.NEYNAR_API_KEY
      const signerUuid = process.env.NEYNAR_SIGNER_UUID
      if (!apiKey) {
        throw new Error('NEYNAR_API_KEY environment variable is not set')
      }
      if (!signerUuid) {
        throw new Error('NEYNAR_SIGNER_UUID environment variable is not set')
      }
      NeynarService.instance = new NeynarService(apiKey, signerUuid)
    }
    return NeynarService.instance
  }

  private async makeRequest<T>(
    endpoint: string,
    options?: {
      method?: 'GET' | 'POST' | 'DELETE'
      body?: string
    }
  ): Promise<T> {
    const { method = 'GET', body } = options ?? {}

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-KEY': this.apiKey,
      },
      method,
      body,
    })

    if (!response.ok) {
      throw new Error(`Neynar API error: ${response.status}`)
    }

    return response.json()
  }

  async createCast(params: {
    text: string
    reply?: string
    channel?: string
    images?: string[]
    embeds?: string[]
  }): Promise<CastResponse> {
    const embedsArray: Array<{ url?: string; castId?: { hash: string; fid: number } }> = []
    let parent: string | undefined
    let parentAuthorFid: number | undefined

    // Add images first (they appear at the top)
    if (params.images) {
      for (const imageUrl of params.images) {
        if (embedsArray.length < 2) {
          embedsArray.push({ url: imageUrl })
        }
      }
    }

    // Add other embeds (links, etc.)
    if (params.embeds) {
      for (const embedUrl of params.embeds) {
        if (embedsArray.length < 2) {
          // Check if it's a Farcaster cast URL
          const castData = await this.getCastFromURL(embedUrl)
          if (castData) {
            embedsArray.push({ castId: castData })
          } else {
            embedsArray.push({ url: embedUrl })
          }
        }
      }
    }

    if (params.reply) {
      // Check if it's a cast hash or URL
      if (params.reply.startsWith('0x')) {
        parent = params.reply
        // Fetch the cast to get the author FID
        const castResponse = await this.getCast(params.reply)
        if (castResponse.cast) {
          parentAuthorFid = castResponse.cast.author.fid
        }
      } else {
        // It's a URL, try to parse as a Farcaster cast
        const castData = await this.getCastFromURL(params.reply)
        if (castData) {
          parent = castData.hash
          parentAuthorFid = castData.fid
        } else {
          // Not a cast URL, add as embed if we have room
          if (embedsArray.length < 2) {
            embedsArray.push({ url: params.reply })
          }
        }
      }
    }

    const body = {
      signer_uuid: this.signerUuid,
      text: params.text,
      parent,
      parent_author_fid: parentAuthorFid,
      channel_id: params.channel,
      embeds: embedsArray.length > 0 ? embedsArray : undefined,
    }

    return this.makeRequest<CastResponse>('/farcaster/cast', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async getCast(hash: string) {
    return this.makeRequest<{
      cast: {
        hash: string
        author: { fid: number }
      } | null
    }>(`/farcaster/cast?type=hash&identifier=${hash}`)
  }

  async deleteCast(hash: string): Promise<{ success: boolean }> {
    await this.makeRequest('/farcaster/cast', {
      method: 'DELETE',
      body: JSON.stringify({
        signer_uuid: this.signerUuid,
        target_hash: hash,
      }),
    })
    return { success: true }
  }

  async getCastByHash(hash: string): Promise<FarcasterCast | null> {
    try {
      const response = await this.makeRequest<{
        cast: FarcasterCast | null
      }>(`/farcaster/cast?type=hash&identifier=${hash}`)
      return response.cast
    } catch {
      return null
    }
  }

  async getCastsByFid(fid: number, limit: number = 25): Promise<FarcasterCast[]> {
    try {
      const response = await this.makeRequest<{
        casts: FarcasterCast[]
      }>(`/farcaster/feed?feed_type=filter&filter_type=fids&fid=${fid}&fids=${fid}&limit=${limit}`)
      return response.casts || []
    } catch {
      return []
    }
  }

  async getUserByUsername(username: string): Promise<{
    user?: {
      fid: number
      verified_accounts?: Array<{ platform: string; username: string }>
    }
  }> {
    try {
      return await this.makeRequest(`/farcaster/user/by_username?username=${username}`)
    } catch {
      return {}
    }
  }

  private async getCastFromURL(
    castURL: string
  ): Promise<{ hash: string; fid: number } | undefined> {
    try {
      const url = new URL(castURL)
      const isWarpcast =
        url.hostname === 'warpcast.com' &&
        (!!url.pathname.match(/^\/[^/]+\/0x[a-f0-9]+$/) ||
          !!url.pathname.match(/^\/~\/conversations\/0x[a-f0-9]+$/))

      if (isWarpcast) {
        const response = await this.makeRequest<{
          cast: { hash: string; author: { fid: number } } | null
        }>(`/farcaster/cast?type=url&identifier=${encodeURIComponent(castURL)}`)
        if (response.cast) {
          return { hash: response.cast.hash, fid: response.cast.author.fid }
        }
      }
    } catch {
      // Not a valid URL
    }
    return undefined
  }
}

export function getNeynar(): NeynarService {
  return NeynarService.getInstance()
}
