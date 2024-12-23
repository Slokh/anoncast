import { createElysia } from '../utils'
import { t } from 'elysia'
import { redis } from '../services/redis'
import { neynar } from '../services/neynar'
import { Cast } from '../services/neynar/types'
import { getPostCredentials, getPostRelationships, getPosts, Post } from '@anonworld/db'

export const feedsRoutes = createElysia({ prefix: '/feeds' })
  .get(
    '/:fid/trending',
    async ({ params }) => {
      const cached = await redis.getTrendingFeed(params.fid)
      if (cached) {
        return { data: JSON.parse(cached) }
      }

      const posts = await getFormattedPosts(params.fid)
      const feed = await buildTrendingFeed(params.fid, posts)

      return { data: feed }
    },
    {
      params: t.Object({
        fid: t.Number(),
      }),
    }
  )
  .get(
    '/:fid/new',
    async ({ params, query }) => {
      const cached = await redis.getNewFeed(params.fid)
      if (cached) {
        return { data: JSON.parse(cached) }
      }

      const posts = await getFormattedPosts(params.fid)
      const feed = await buildNewFeed(params.fid, posts)

      return { data: feed }
    },
    {
      params: t.Object({ fid: t.Number() }),
      query: t.Object({ limit: t.Optional(t.Number()), offset: t.Optional(t.Number()) }),
    }
  )

const getFormattedPosts = async (fid: number) => {
  const posts = await getPosts(fid, {
    limit: 100,
    offset: 0,
  })

  if (posts.length === 0) return []

  return await formatPosts(posts)
}

const buildTrendingFeed = async (fid: number, posts: Array<Cast>) => {
  const now = Date.now()
  const feed = posts
    .sort((a, b) => {
      const aScore =
        (a.aggregate.likes || 0) /
        ((now - new Date(a.timestamp).getTime()) / 3600000 + 2) ** 1.5
      const bScore =
        (b.aggregate.likes || 0) /
        ((now - new Date(b.timestamp).getTime()) / 3600000 + 2) ** 1.5
      return bScore - aScore
    })
    .slice(0, 25)

  await redis.setTrendingFeed(fid, JSON.stringify(feed))
  return feed
}

const buildNewFeed = async (fid: number, posts: Array<Post>) => {
  await redis.setNewFeed(fid, JSON.stringify(posts))
  return posts
}

export const buildFeeds = async (fid: number) => {
  const posts = await getFormattedPosts(fid)
  if (posts.length === 0) return
  await buildTrendingFeed(fid, posts)
  await buildNewFeed(fid, posts)
}

export async function formatPosts(posts: Array<Post>) {
  const [relationships, credentials] = await Promise.all([
    getPostRelationships(posts.map((p) => p.hash)),
    getPostCredentials(posts.map((p) => p.hash)),
  ])

  const hashes = posts.map((p) => p.hash)
  for (const relationship of relationships) {
    if (relationship.target === 'farcaster') {
      hashes.push(relationship.target_id)
    }
  }

  const response = await neynar.getBulkCasts(hashes)

  const augmentedPosts: Array<any> = []
  for (const post of posts) {
    const postRelationships = relationships.filter((r) => r.post_hash === post.hash)
    const postCredentials = credentials.filter(
      (c) => c.post_credentials.post_hash === post.hash
    )

    const primaryCast = response.result.casts.find((cast) => cast.hash === post.hash)
    if (!primaryCast) continue

    const relatedCasts = response.result.casts.filter((cast) =>
      postRelationships.some((r) => r.target_id === cast.hash)
    )

    augmentedPosts.push({
      ...primaryCast,
      reveal: post.reveal_hash
        ? {
            ...(post.reveal_metadata || {}),
            revealHash: post.reveal_hash,
            input: JSON.stringify(post.data),
            revealedAt: post.updated_at.toISOString(),
          }
        : undefined,
      credentials: postCredentials.map((c) => ({
        ...c.credential_instances,
        proof: undefined,
      })),
      relationships: postRelationships.map((r) => ({
        target: r.target,
        targetAccount: r.target_account,
        targetId: r.target_id,
      })),
      aggregate: {
        likes:
          primaryCast.reactions.likes_count +
          relatedCasts.reduce((acc, c) => acc + c.reactions.likes_count, 0),
        replies:
          primaryCast.replies.count +
          relatedCasts.reduce((acc, c) => acc + c.replies.count, 0),
      },
    })
  }

  return augmentedPosts
}
