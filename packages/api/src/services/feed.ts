import { FarcasterCast, Post, encodeJson } from '@anonworld/common'
import { db } from '../db'
import { neynar } from './neynar'
import { DBPost, DBPostRelationship } from '../db/types'
import { redis } from './redis'

export class FeedService {
  async getFeedPost(hash: string) {
    let post = await db.posts.get(hash)

    // Resolve original post
    if (post?.fid !== 884230) {
      const parent = await db.relationships.getParent(hash)
      if (parent) {
        post = await db.posts.get(parent.post_hash)
      }
    }

    if (!post) return null

    const [formattedPost] = await this.getFeed([post])
    return formattedPost
  }

  async getFeed(posts: Array<DBPost>) {
    if (posts.length === 0) return []

    const [relationships, credentials] = await Promise.all([
      this.getRelationships(posts),
      db.posts.getCredentials(posts.map((p) => p.hash)),
    ])

    const tokenIds = new Set<string>()
    for (const credential of Object.values(credentials).flat()) {
      if ('chainId' in credential.metadata) {
        tokenIds.add(`${credential.metadata.chainId}:${credential.metadata.tokenAddress}`)
      }
    }

    const fids = new Set<number>()
    const usernames = new Set<string>()
    const hashes = new Set<string>(posts.map((p) => p.hash))
    for (const relationship of Object.values(relationships).flat()) {
      if (relationship.target === 'farcaster') {
        fids.add(Number(relationship.target_account))
        hashes.add(relationship.target_id)
      } else if (relationship.target === 'twitter') {
        usernames.add(relationship.target_account)
      }
    }

    const [tokens, farcasterAccounts, twitterAccounts, communities, likes, replies] =
      await Promise.all([
        db.tokens.getBulk(Array.from(tokenIds)),
        this.getRelatedFarcasterAccounts(Array.from(fids)),
        this.getRelatedTwitterAccounts(Array.from(usernames)),
        this.getRelatedCommunities(Array.from(fids), Array.from(usernames)),
        db.posts.countLikes(Array.from(hashes)),
        db.posts.countReplies(Array.from(hashes)),
      ])

    const casts = await this.getCasts(Array.from(hashes))

    const result: Array<Post> = []
    for (const post of posts) {
      const cast = casts[post.hash]
      if (!cast) continue

      const formattedPost: Post = {
        ...cast,
        relationships: [],
        credentials: [],
        aggregate: { likes: 0, replies: 0 },
      }

      if (post.reveal_hash) {
        formattedPost.reveal = {
          ...(post.reveal_metadata || {}),
          revealHash: post.reveal_hash,
          input: encodeJson(post.data),
          revealedAt: post.updated_at.toISOString(),
        }
      }

      formattedPost.credentials =
        credentials[post.hash]?.map((c) => ({
          ...c,
          token:
            'chainId' in c.metadata
              ? tokens[`${c.metadata.chainId}:${c.metadata.tokenAddress}`]
              : undefined,
          vault: c.vault
            ? {
                ...c.vault,
                passkeyId: undefined,
                credentials: [],
                created_at: c.created_at.toISOString(),
              }
            : undefined,
          id: undefined,
          proof: undefined,
          parent_id: undefined,
          reverified_id: undefined,
        })) ?? []

      formattedPost.relationships =
        relationships[post.hash]?.map((r) => ({
          target: r.target,
          targetAccount: r.target_account,
          targetId: r.target_id,
          twitter: twitterAccounts[r.target_account],
          farcaster: farcasterAccounts[Number(r.target_account)],
          community: communities[r.target_account],
        })) ?? []

      const relatedCasts =
        relationships[post.hash]?.map((r) => casts[r.target_id]).filter((c) => c) ?? []

      let postLikes = likes[post.hash] ?? 0
      let postReplies = replies[post.hash] ?? 0
      for (const c of relatedCasts) {
        if (likes[c.hash]) {
          postLikes += likes[c.hash]
        }
        if (replies[c.hash]) {
          postReplies += replies[c.hash]
        }
      }

      formattedPost.aggregate = {
        likes: postLikes,
        replies: postReplies,
      }

      result.push(formattedPost)
    }

    return result
  }

  private async getCasts(hashes: string[]) {
    const BATCH_SIZE = 100
    const casts: Record<string, FarcasterCast> = {}

    const cached = await redis.getCasts(hashes)
    for (let i = 0; i < hashes.length; i++) {
      const item = cached[i]
      if (item) {
        casts[hashes[i]] = JSON.parse(item)
      }
    }

    const uncached = hashes.filter((hash) => !casts[hash])

    if (uncached.length > 0) {
      for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
        const batchHashes = uncached.slice(i, i + BATCH_SIZE)
        const response = await neynar.getBulkCasts(batchHashes)

        response.result.casts.forEach((cast) => {
          casts[cast.hash] = cast
        })
        await redis.setCasts(response.result.casts)
      }
    }

    return casts
  }

  private async getRelationships(posts: DBPost[]) {
    const relationships = await db.relationships.getBulk(posts.map((p) => p.hash))
    const relationshipsByHash = relationships.reduce(
      (acc, r) => {
        if (!acc[r.post_hash]) {
          acc[r.post_hash] = []
        }
        acc[r.post_hash].push(r)
        return acc
      },
      {} as Record<string, DBPostRelationship[]>
    )
    return relationshipsByHash
  }

  private async getRelatedFarcasterAccounts(fids: number[]) {
    const farcasterAccounts = await db.socials.getFarcasterAccounts(fids)
    const farcasterAccountsById = farcasterAccounts.reduce(
      (acc, f) => {
        acc[f.fid] = f.metadata
        return acc
      },
      {} as Record<number, any>
    )
    return farcasterAccountsById
  }

  private async getRelatedTwitterAccounts(usernames: string[]) {
    const twitterAccounts = await db.socials.getTwitterAccounts(usernames)
    const twitterAccountsById = twitterAccounts.reduce(
      (acc, t) => {
        acc[t.username] = t.metadata
        return acc
      },
      {} as Record<string, any>
    )
    return twitterAccountsById
  }

  private async getRelatedCommunities(fids: number[], usernames: string[]) {
    const communities = await db.communities.getForAccounts(fids, usernames)
    const communitiesById = communities.reduce(
      (acc, c) => {
        acc[c.fid.toString()] = c
        if (c.twitter_username) {
          acc[c.twitter_username] = c
        }
        return acc
      },
      {} as Record<number | string, any>
    )
    return communitiesById
  }

  public async addUserData(passkeyId: string, posts: Array<Post>) {
    const hashes = posts.map((p) => p.hash)
    const likes = await db.posts.getLikes(passkeyId, hashes)
    const likedHashes = likes.map((l) => l.post_hash)
    return posts.map((p) => ({ ...p, user: { liked: likedHashes.includes(p.hash) } }))
  }
}

export const feed = new FeedService()
