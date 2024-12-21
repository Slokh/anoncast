export type ApiResponse<T> =
  | {
      data: T
      error?: never
    }
  | {
      data?: never
      error: {
        message: string
        status: number
      }
    }

export type RequestConfig = {
  authenticated?: boolean
  headers?: Record<string, string>
  isFormData?: boolean
} & Omit<RequestInit, 'headers'>

export type UploadImageResponse = {
  success: boolean
  status: number
  data?: {
    link: string
  }
  error?: string
}

export type User = {
  object: string
  fid: number
  username: string
  display_name: string
  pfp_url: string
  custody_address: string
  profile: {
    bio: {
      text: string
    }
    location: {
      latitude: number
      longitude: number
      address: {
        city: string
        state: string
        state_code: string
        country: string
        country_code: string
      }
    }
  }
  follower_count: number
  following_count: number
  verifications: Array<string>
  verified_addresses: {
    eth_addresses: Array<string>
    sol_addresses: Array<any>
  }
  verified_accounts: Array<{
    platform: string
    username: string
  }>
  power_badge: boolean
}

export type Channel = {
  id: string
  url: string
  name: string
  description: string
  object: string
  created_at: number
  follower_count: number
  external_link: {
    title: string
    url: string
  }
  image_url: string
  parent_url: string
  lead: {
    object: string
    fid: number
    username: string
    display_name: string
    custody_address: string
    pfp_url: string
    profile: {
      bio: {
        text: string
        mentioned_profiles: Array<string>
      }
      location: {
        latitude: number
        longitude: number
        address: {
          city: string
          state: string
          state_code: string
          country: string
          country_code: string
        }
      }
    }
    follower_count: number
    following_count: number
    verifications: Array<string>
    verified_addresses: {
      eth_addresses: Array<string>
      sol_addresses: Array<string>
    }
    verified_accounts: Array<{
      platform: string
      username: string
    }>
    power_badge: boolean
    experimental: {
      neynar_user_score: number
    }
    viewer_context: {
      following: boolean
      followed_by: boolean
      blocking: boolean
      blocked_by: boolean
    }
  }
  moderator_fids: Array<number>
  member_count: number
  pinned_cast_hash: string
  viewer_context: {
    following: boolean
    role: string
  }
}

export type Cast = {
  hash: string
  parent_hash: string
  parent_url: string
  root_parent_url: string
  parent_author: {
    fid: number
  }
  author: {
    object: string
    fid: number
    username: string
    display_name: string
    custody_address: string
    pfp_url: string
    profile: {
      bio: {
        text: string
        mentioned_profiles: Array<string>
      }
      location: {
        latitude: number
        longitude: number
        address: {
          city: string
          state: string
          state_code: string
          country: string
          country_code: string
        }
      }
    }
    follower_count: number
    following_count: number
    verifications: Array<string>
    verified_addresses: {
      eth_addresses: Array<string>
      sol_addresses: Array<string>
    }
    verified_accounts: Array<{
      platform: string
      username: string
    }>
    power_badge: boolean
    experimental: {
      neynar_user_score: number
    }
    viewer_context: {
      following: boolean
      followed_by: boolean
      blocking: boolean
      blocked_by: boolean
    }
  }
  text: string
  timestamp: string
  embeds: Array<Embed>
  type: string
  frames: Array<{
    version: string
    image: string
    buttons: Array<{
      title: string
      index: number
      action_type: string
      target: string
      post_url: string
    }>
    post_url: string
    frames_url: string
    title: string
    image_aspect_ratio: string
    input: {
      text: string
    }
    state: {
      serialized: string
    }
  }>
  reactions: {
    likes: Array<{
      fid: number
    }>
    recasts: Array<{
      fid: number
      fname: string
    }>
    likes_count: number
    recasts_count: number
  }
  replies: {
    count: number
  }
  thread_hash: string
  mentioned_profiles: Array<{
    object: string
    fid: number
    username: string
    display_name: string
    custody_address: string
    pfp_url: string
    profile: {
      bio: {
        text: string
        mentioned_profiles: Array<string>
      }
      location: {
        latitude: number
        longitude: number
        address: {
          city: string
          state: string
          state_code: string
          country: string
          country_code: string
        }
      }
    }
    follower_count: number
    following_count: number
    verifications: Array<string>
    verified_addresses: {
      eth_addresses: Array<string>
      sol_addresses: Array<string>
    }
    verified_accounts: Array<{
      platform: string
      username: string
    }>
    power_badge: boolean
    experimental: {
      neynar_user_score: number
    }
    viewer_context: {
      following: boolean
      followed_by: boolean
      blocking: boolean
      blocked_by: boolean
    }
  }>
  channel?: Channel
  viewer_context: {
    liked: boolean
    recasted: boolean
  }
  author_channel_context: {
    following: boolean
    role: string
  }
  reveal?: Reveal
  relationships: Array<Relationship>
  credentials: Array<Credential>
  aggregate: {
    likes: number
    replies: number
  }
}

export type Reveal = {
  revealHash: string
  input: string
  phrase?: string
  signature?: string
  address?: string
  revealedAt: string
}

export type Relationship = {
  target: string
  targetAccount: string
  targetId: string
}

export type Credential = {
  id: string
  credential_id: string
  metadata: {
    chainId: string
    tokenAddress: `0x${string}`
    balance: string
  }
  verified_at: string
}

export type Embed = {
  url?: string
  metadata?: {
    _status: string
    content_type: string
    content_length: number
    image: {
      height_px: number
      width_px: number
    }
    video: {
      duration_s: number
      stream: Array<{
        codec_name: string
        height_px: number
        width_px: number
      }>
    }
    html: {
      favicon: string
      modifiedTime: string
      ogArticleAuthor: string
      ogArticleExpirationTime: string
      ogArticleModifiedTime: string
      ogArticlePublishedTime: string
      ogArticlePublisher: string
      ogArticleSection: string
      ogArticleTag: string
      ogAudio: string
      ogAudioSecureURL: string
      ogAudioType: string
      ogAudioURL: string
      ogAvailability: string
      ogDate: string
      ogDescription: string
      ogDeterminer: string
      ogEpisode: string
      ogImage: Array<{
        height: string
        type: string
        url: string
        width: string
        alt: string
      }>
      ogLocale: string
      ogLocaleAlternate: string
      ogLogo: string
      ogMovie: string
      ogPriceAmount: string
      ogPriceCurrency: string
      ogProductAvailability: string
      ogProductCondition: string
      ogProductPriceAmount: string
      ogProductPriceCurrency: string
      ogProductRetailerItemId: string
      ogSiteName: string
      ogTitle: string
      ogType: string
      ogUrl: string
      ogVideo: Array<{
        height: string
        type: string
        url: string
        width: string
      }>
      ogVideoActor: string
      ogVideoActorId: string
      ogVideoActorRole: string
      ogVideoDirector: string
      ogVideoDuration: string
      ogVideoOther: string
      ogVideoReleaseDate: string
      ogVideoSecureURL: string
      ogVideoSeries: string
      ogVideoTag: string
      ogVideoTvShow: string
      ogVideoWriter: string
      ogWebsite: string
      updatedTime: string
      oembed: {
        type: string
        version: string
        title: string
        author_name: string
        author_url: string
        provider_name: string
        provider_url: string
        cache_age: string
        thumbnail_url: string
        thumbnail_width: number
        thumbnail_height: number
        html: string
        width: number
        height: number
      }
    }
  }
  cast?: {
    hash: string
    parent_hash: string
    parent_url: string
    root_parent_url: string
    parent_author: {
      fid: number
    }
    author: {
      object: string
      fid: number
      username: string
      display_name: string
      pfp_url: string
    }
    text: string
    timestamp: string
    type: string
    embeds: Array<Embed>
    channel: {
      id: string
      name: string
      object: string
      image_url: string
      viewer_context: {
        following: boolean
        role: string
      }
    }
  }
}

export type CreatePostActionData = {
  text?: string
  embeds?: string[]
  images?: string[]
  quote?: string
  channel?: string
  parent?: string
  revealHash?: string
}

export type DeletePostFarcasterActionData = {
  hash: string
}

export type DeletePostTwitterActionData = {
  tweetId: string
}

export type CopyPostFarcasterActionData = {
  hash: string
}

export type CopyPostTwitterActionData = {
  hash: string
  reply?: boolean
}

export type PerformActionData =
  | CreatePostActionData
  | DeletePostFarcasterActionData
  | DeletePostTwitterActionData
  | CopyPostFarcasterActionData
  | CopyPostTwitterActionData

export type PerformAction = {
  credentials: string[]
  actionId: string
  data: PerformActionData
}

type BaseAction = {
  id: string
  created_at: Date
  updated_at: Date
  credential_id: string | null
  credential_requirement: {
    minimumBalance: string
  } | null
  trigger: string
}

export type ActionTargetPost = {
  post: {
    text: {
      eq?: string[]
      ne?: string[]
    }
  }
}

export type Action =
  | (BaseAction & {
      type: ActionType.COPY_POST_TWITTER
      metadata: {
        twitter: string
        target: ActionTargetPost
      }
    })
  | (BaseAction & {
      type: ActionType.DELETE_POST_TWITTER
      metadata: {
        twitter: string
      }
    })
  | (BaseAction & {
      type: ActionType.COPY_POST_FARCASTER
      metadata: {
        fid: string
        target: ActionTargetPost
      }
    })
  | (BaseAction & {
      type: ActionType.DELETE_POST_FARCASTER
      metadata: {
        fid: string
      }
    })
  | (BaseAction & {
      type: ActionType.CREATE_POST
      metadata: {
        target: ActionTargetPost
      }
    })

export enum ActionType {
  CREATE_POST = 'CREATE_POST',
  COPY_POST_TWITTER = 'COPY_POST_TWITTER',
  COPY_POST_FARCASTER = 'COPY_POST_FARCASTER',
  DELETE_POST_TWITTER = 'DELETE_POST_TWITTER',
  DELETE_POST_FARCASTER = 'DELETE_POST_FARCASTER',
}
