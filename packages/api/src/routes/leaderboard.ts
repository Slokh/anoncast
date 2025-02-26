import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  credentialsTable,
  postCredentialsTable,
  postLikesTable,
  postRelationshipsTable,
  postRepliesTable,
  postsTable,
  vaultsTable,
} from '../db/schema'
import { redis } from '../services/redis'
import { createElysia } from '../utils'
import { neynar } from '../services/neynar'
import { Community, FarcasterUser } from '@anonworld/common'
import { DBCredential } from '../db/types'
import { DBVault } from '../db/types'
import { t } from 'elysia'

export const leaderboardRoutes = createElysia({ prefix: '/leaderboard' }).get(
  '/',
  async ({ query }) => {
    const timeframe = query.timeframe ?? 'all-time'
    const community = query.community
    const cached = await redis.getLeaderboard(
      `${timeframe}${community ? `:${community}` : ''}`
    )
    if (cached) {
      return {
        data: JSON.parse(cached).slice(0, 100),
      }
    }
    return { data: [] }
  },
  {
    query: t.Object({
      timeframe: t.Optional(t.String()),
      community: t.Optional(t.String()),
    }),
  }
)

type CredentialData = {
  credentialId: string
  likes: {
    fids: {
      fid: number
      timestamp: Date
      targetFid: number
    }[]
    passkeys: {
      passkeyId: string
      timestamp: Date
      targetFid: number
    }[]
  }
  replies: {
    fids: { fid: number; timestamp: Date; targetFid: number }[]
  }
  posts: {
    targetFid: number
    hash: string
    timestamp: Date
  }[]
}

async function getDataByCredentialId(community?: Community) {
  const posts = await db.db
    .select()
    .from(postCredentialsTable)
    .innerJoin(postsTable, eq(postCredentialsTable.post_hash, postsTable.hash))
    .where(
      and(
        sql`${postsTable.data}->>'reply' IS NULL`,
        isNull(postsTable.deleted_at),
        community ? eq(postsTable.fid, community.fid) : undefined
      )
    )

  const postHashes = posts.map((post) => post.posts.hash)
  const credentialIds = posts.map((post) => post.post_credentials.credential_id)

  const [relationships, credentials] = await Promise.all([
    db.db
      .select()
      .from(postRelationshipsTable)
      .where(
        and(
          or(
            inArray(postRelationshipsTable.post_hash, postHashes),
            inArray(postRelationshipsTable.target_id, postHashes)
          ),
          eq(postRelationshipsTable.target, 'farcaster')
        )
      ),
    db.db
      .select({
        id: credentialsTable.id,
        parent_id: credentialsTable.parent_id,
        verified_at: credentialsTable.verified_at,
      })
      .from(credentialsTable)
      .where(
        and(
          inArray(credentialsTable.id, credentialIds),
          community
            ? or(
                eq(
                  credentialsTable.credential_id,
                  `ERC20_BALANCE:${community.token.chain_id}:${community.token.address.toLowerCase()}`
                ),
                eq(
                  credentialsTable.credential_id,
                  `ERC721_BALANCE:${community.token.chain_id}:${community.token.address.toLowerCase()}`
                )
              )
            : undefined
        )
      ),
  ])

  const allPostHashes = Array.from(
    new Set([
      ...postHashes,
      ...relationships.flatMap((post) => [post.post_hash, post.target_id]),
    ])
  )

  const parentMap = credentials.reduce(
    (acc, credential) => {
      acc[credential.id] = credential.parent_id
      return acc
    },
    {} as Record<string, string>
  )

  const latestMap = credentials.reduce(
    (acc, credential) => {
      if (
        !acc[credential.parent_id] ||
        credential.verified_at > acc[credential.parent_id].verified_at
      ) {
        acc[credential.parent_id] = {
          id: credential.id,
          verified_at: credential.verified_at,
        }
      }
      return acc
    },
    {} as Record<string, { id: string; verified_at: Date }>
  )

  const [likesResults, repliesResults] = await Promise.all([
    db.db
      .select()
      .from(postCredentialsTable)
      .innerJoin(
        postLikesTable,
        eq(postCredentialsTable.post_hash, postLikesTable.post_hash)
      )
      .where(inArray(postCredentialsTable.post_hash, allPostHashes)),
    db.db
      .select()
      .from(postCredentialsTable)
      .innerJoin(
        postRepliesTable,
        eq(postCredentialsTable.post_hash, postRepliesTable.post_hash)
      )
      .where(inArray(postCredentialsTable.post_hash, allPostHashes)),
  ])

  const postMap = posts.reduce(
    (acc, post) => {
      acc[post.posts.hash] = {
        credentialId: post.post_credentials.credential_id,
        targetFid: post.posts.fid,
        hash: post.posts.hash,
        timestamp: post.posts.created_at,
      }
      return acc
    },
    {} as Record<
      string,
      { credentialId: string; targetFid: number; hash: string; timestamp: Date }
    >
  )

  const seenPosts = new Set<string>()

  const data: Record<string, CredentialData> = {}
  for (const row of likesResults) {
    const post = postMap[row.post_likes.post_hash]
    if (!post) {
      continue
    }
    seenPosts.add(post.hash)

    const credentialId = parentMap[row.post_credentials.credential_id]
    if (!credentialId) {
      continue
    }

    if (!data[credentialId]) {
      data[credentialId] = {
        credentialId: latestMap[credentialId].id,
        likes: { fids: [], passkeys: [] },
        replies: { fids: [] },
        posts: [],
      }
    }

    if (row.post_likes.fid) {
      data[credentialId].likes.fids.push({
        fid: row.post_likes.fid,
        timestamp: row.post_likes.created_at,
        targetFid: post.targetFid,
      })
    }

    if (row.post_likes.passkey_id) {
      data[credentialId].likes.passkeys.push({
        passkeyId: row.post_likes.passkey_id,
        timestamp: row.post_likes.created_at,
        targetFid: post.targetFid,
      })
    }

    if (
      (community || post.targetFid === 884230) &&
      !data[credentialId].posts.find((p) => p.hash === post.hash)
    ) {
      data[credentialId].posts.push(post)
    }
  }

  for (const row of repliesResults) {
    const post = postMap[row.post_replies.post_hash]
    if (!post) {
      continue
    }
    seenPosts.add(post.hash)

    const credentialId = parentMap[row.post_credentials.credential_id]
    if (!credentialId) {
      continue
    }

    if (!data[credentialId]) {
      data[credentialId] = {
        credentialId: latestMap[credentialId].id,
        likes: { fids: [], passkeys: [] },
        replies: { fids: [] },
        posts: [],
      }
    }

    data[credentialId].replies.fids.push({
      fid: row.post_replies.fid,
      timestamp: row.post_replies.created_at,
      targetFid: post.targetFid,
    })

    if (
      (community || post.targetFid === 884230) &&
      !data[credentialId].posts.find((p) => p.hash === post.hash)
    ) {
      data[credentialId].posts.push(post)
    }
  }

  for (const row of Object.values(postMap)) {
    if (seenPosts.has(row.hash)) {
      continue
    }

    const credentialId = parentMap[row.credentialId]
    if (!credentialId) {
      continue
    }

    if (!data[credentialId]) {
      data[credentialId] = {
        credentialId: latestMap[credentialId].id,
        likes: { fids: [], passkeys: [] },
        replies: { fids: [] },
        posts: [],
      }
    }

    if (community || row.targetFid === 884230) {
      data[credentialId].posts.push(row)
    }
  }

  return Object.values(data)
}

async function getFarcasterUsers(fids: number[]) {
  if (fids.length === 0) {
    return {}
  }

  const users: Record<number, FarcasterUser> = {}

  const cached = await redis.getFarcasterUsers(fids)
  for (let i = 0; i < fids.length; i++) {
    const item = cached[i]
    if (item) {
      users[fids[i]] = JSON.parse(item)
    }
  }

  const uncached = fids.filter((fid) => !users[fid])

  if (uncached.length > 0) {
    const batchSize = 100

    for (let i = 0; i < uncached.length; i += batchSize) {
      const batch = uncached.slice(i, i + batchSize)
      const response = await neynar.getBulkUsersByFids(batch)
      for (const user of response.users) {
        users[user.fid] = user
      }
      await redis.setFarcasterUsers(response.users)
    }
  }

  return users
}

async function getScores(data: CredentialData[]) {
  const fids = new Set<number>()
  for (const d of data) {
    const likeFids = d.likes.fids.map((fid) => fid.fid)
    for (const fid of likeFids) {
      fids.add(fid)
    }
    const replyFids = d.replies.fids.map((fid) => fid.fid)
    for (const fid of replyFids) {
      fids.add(fid)
    }
  }

  const farcasterUsers = await getFarcasterUsers(Array.from(fids))
  const maxFollowerCount = Math.max(
    ...Object.values(farcasterUsers).map((user) => user.follower_count)
  )

  const scores: Record<
    string,
    {
      credentialId: string
      score: number
      likes: number
      replies: number
      posts: number
    }
  > = {}

  for (const credentialData of data) {
    const credentialId = credentialData.credentialId
    if (!scores[credentialId]) {
      scores[credentialId] = {
        credentialId,
        score: 0,
        likes: credentialData.likes.fids.length + credentialData.likes.passkeys.length,
        replies: credentialData.replies.fids.length,
        posts: credentialData.posts.length,
      }
    }

    for (const fid of credentialData.likes.fids) {
      const user = farcasterUsers[fid.fid]
      if (user) {
        scores[credentialId].score += Math.floor(
          (user.follower_count / maxFollowerCount) * 100
        )
      }
    }

    for (const fid of credentialData.replies.fids) {
      const user = farcasterUsers[fid.fid]
      if (user) {
        scores[credentialId].score += Math.floor(
          (user.follower_count / maxFollowerCount) * 100
        )
      }
    }

    scores[credentialId].score += 25 * credentialData.likes.passkeys.length
  }

  return Object.values(scores)
    .sort((a, b) => b.score - a.score)
    .filter((score) => score.score > 0)
}

async function formatLeaderboard(
  scores: {
    credentialId: string
    score: number
    likes: number
    replies: number
    posts: number
  }[]
) {
  const credentials = await db.db
    .select()
    .from(credentialsTable)
    .leftJoin(vaultsTable, eq(credentialsTable.vault_id, vaultsTable.id))
    .where(
      inArray(
        credentialsTable.id,
        scores.map((score) => score.credentialId)
      )
    )

  const credentialsById = credentials.reduce(
    (acc, credential) => {
      acc[credential.credential_instances.id] = {
        ...credential.credential_instances,
        vault: credential.vaults,
      } as DBCredential & { vault: DBVault | null }
      return acc
    },
    {} as Record<string, DBCredential & { vault: DBVault | null }>
  )

  const tokenIds = new Set<string>()
  for (const credential of Object.values(credentialsById)) {
    if ('chainId' in credential.metadata) {
      tokenIds.add(`${credential.metadata.chainId}:${credential.metadata.tokenAddress}`)
    }
  }

  const tokens = await db.tokens.getBulk(Array.from(tokenIds))

  const data = scores.map((score) => {
    const credential = credentialsById[score.credentialId]

    let tokenId: string | undefined
    if ('chainId' in credential.metadata) {
      tokenId = `${credential.metadata.chainId}:${credential.metadata.tokenAddress}`
    }

    return {
      score: score.score,
      posts: score.posts,
      likes: score.likes,
      replies: score.replies,
      credential: {
        ...credential,
        token: tokenId ? tokens[tokenId] : undefined,
        vault: credential.vault
          ? {
              ...credential.vault,
              passkey_id: undefined,
              credentials: [],
              created_at: credential.created_at.toISOString(),
            }
          : undefined,
        id: undefined,
        proof: undefined,
        parent_id: undefined,
        reverified_id: undefined,
      },
    }
  })

  return data
}

export async function updateLeaderboard() {
  console.log('[leaderboard] getting data')
  const data = await getDataByCredentialId()
  console.log('[leaderboard] formatting all time leaderboard')
  const allTimeLeaderboard = await updateAllTimeLeaderboard(data)
  await redis.setLeaderboard('all-time', JSON.stringify(allTimeLeaderboard))
  console.log('[leaderboard] formatting weekly leaderboard')
  const weeklyLeaderboard = await updateWeeklyLeaderboard(data)
  await redis.setLeaderboard('week', JSON.stringify(weeklyLeaderboard))
  console.log('[leaderboard] formatting last week leaderboard')
  const lastWeekLeaderboard = await updateLastWeekLeaderboard(data)
  await redis.setLeaderboard('last-week', JSON.stringify(lastWeekLeaderboard))

  const communities = await db.communities.list()
  for (const community of communities) {
    const data = await getDataByCredentialId(community)
    console.log(`[leaderboard] [${community.fid}] formatting all time leaderboard`)
    const communityAllTimeLeaderboard = await updateAllTimeLeaderboard(
      data,
      community.fid
    )
    await redis.setLeaderboard(
      `all-time:${community.id}`,
      JSON.stringify(communityAllTimeLeaderboard)
    )
    console.log(`[leaderboard] [${community.fid}] formatting weekly leaderboard`)
    const communityWeeklyLeaderboard = await updateWeeklyLeaderboard(data, community.fid)
    await redis.setLeaderboard(
      `week:${community.id}`,
      JSON.stringify(communityWeeklyLeaderboard)
    )
    console.log(`[leaderboard] [${community.fid}] formatting last week leaderboard`)
    const communityLastWeekLeaderboard = await updateLastWeekLeaderboard(
      data,
      community.fid
    )
    await redis.setLeaderboard(
      `last-week:${community.id}`,
      JSON.stringify(communityLastWeekLeaderboard)
    )
  }
}

async function updateAllTimeLeaderboard(data: CredentialData[], communityFid?: number) {
  const allTimeData = data
    .map((d) => ({
      ...d,
      likes: {
        fids: d.likes.fids.filter(
          (fid) => !communityFid || fid.targetFid === communityFid
        ),
        passkeys: d.likes.passkeys.filter(
          (passkey) => !communityFid || passkey.targetFid === communityFid
        ),
      },
      replies: {
        fids: d.replies.fids.filter(
          (fid) => !communityFid || fid.targetFid === communityFid
        ),
      },
      posts: d.posts.filter((p) => !communityFid || p.targetFid === communityFid),
    }))
    .filter((d) => d.posts.length > 0)

  const scores = await getScores(allTimeData)
  return await formatLeaderboard(scores.slice(0, 1000))
}

async function updateWeeklyLeaderboard(data: CredentialData[], communityFid?: number) {
  const { start, end } = getTimeframeWindow('week')

  const weekData = data
    .map((d) => ({
      ...d,
      likes: {
        fids: d.likes.fids.filter(
          (fid) =>
            fid.timestamp >= start &&
            fid.timestamp < end &&
            (!communityFid || fid.targetFid === communityFid)
        ),
        passkeys: d.likes.passkeys.filter(
          (passkey) =>
            passkey.timestamp >= start &&
            passkey.timestamp < end &&
            (!communityFid || passkey.targetFid === communityFid)
        ),
      },
      replies: {
        fids: d.replies.fids.filter(
          (fid) =>
            fid.timestamp >= start &&
            fid.timestamp < end &&
            (!communityFid || fid.targetFid === communityFid)
        ),
      },
      posts: d.posts.filter(
        (p) =>
          p.timestamp >= start &&
          p.timestamp < end &&
          (!communityFid || p.targetFid === communityFid)
      ),
    }))
    .filter((d) => d.posts.length > 0)

  const scores = await getScores(weekData)
  return await formatLeaderboard(scores.slice(0, 1000))
}

async function updateLastWeekLeaderboard(data: CredentialData[], communityFid?: number) {
  const { start, end } = getTimeframeWindow('last-week')

  const lastWeekData = data
    .map((d) => ({
      ...d,
      likes: {
        fids: d.likes.fids.filter(
          (fid) =>
            fid.timestamp >= start &&
            fid.timestamp < end &&
            (!communityFid || fid.targetFid === communityFid)
        ),
        passkeys: d.likes.passkeys.filter(
          (passkey) =>
            passkey.timestamp >= start &&
            passkey.timestamp < end &&
            (!communityFid || passkey.targetFid === communityFid)
        ),
      },
      replies: {
        fids: d.replies.fids.filter(
          (fid) =>
            fid.timestamp >= start &&
            fid.timestamp < end &&
            (!communityFid || fid.targetFid === communityFid)
        ),
      },
      posts: d.posts.filter(
        (p) =>
          p.timestamp >= start &&
          p.timestamp < end &&
          (!communityFid || p.targetFid === communityFid)
      ),
    }))
    .filter((d) => d.posts.length > 0)

  const scores = await getScores(lastWeekData)
  return await formatLeaderboard(scores.slice(0, 1000))
}

type TimeframeWindow = {
  start: Date
  end: Date
}

function getTimeframeWindow(
  timeframe: 'week' | 'last-week' | 'all-time'
): TimeframeWindow {
  const now = new Date()

  // For all-time, use a very old start date
  if (timeframe === 'all-time') {
    return {
      start: new Date(0),
      end: new Date(now.getTime() + 86400000),
    }
  }

  // Find the next Wednesday 20:00 UTC
  const currentDay = now.getUTCDay()
  const currentHour = now.getUTCHours()

  // If it's Wednesday after 20:00 UTC, we need to look at next Wednesday
  // If it's any other day, we look at the upcoming Wednesday
  const daysToWednesday = (3 - currentDay + 7) % 7
  const adjustedDaysToWednesday =
    currentDay === 3 && currentHour >= 20 ? 7 : daysToWednesday

  const nextWednesday = new Date(now)
  nextWednesday.setUTCDate(now.getUTCDate() + adjustedDaysToWednesday)
  nextWednesday.setUTCHours(20, 0, 0, 0)
  // Last Wednesday was 7 days before
  const lastWednesday = new Date(nextWednesday)
  lastWednesday.setUTCDate(nextWednesday.getUTCDate() - 7)

  // Previous week was 7 days before last Wednesday
  const previousWednesday = new Date(lastWednesday)
  previousWednesday.setUTCDate(lastWednesday.getUTCDate() - 7)

  switch (timeframe) {
    case 'week':
      return {
        start: lastWednesday,
        end: nextWednesday,
      }
    case 'last-week':
      return {
        start: previousWednesday,
        end: lastWednesday,
      }
    default:
      throw new Error(`Invalid timeframe: ${timeframe}`)
  }
}
