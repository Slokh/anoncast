import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  actionExecutionsTable,
  actionsTable,
  credentialInstancesTable,
  farcasterAccountsTable,
  postCredentialsTable,
  postRelationshipsTable,
  postsTable,
  twitterAccountsTable,
} from './db/schema'

export type CredentialInstance = typeof credentialInstancesTable.$inferSelect
export type Action<T = unknown> = typeof actionsTable.$inferSelect & {
  metadata: T
}
export type Post = typeof postsTable.$inferSelect & {
  data: PostData
}

export type PostData = {
  text?: string
  embeds?: string[]
  images?: string[]
  quote?: string
  channel?: string
  parent?: string
}

export const db = drizzle(process.env.DATABASE_URL as string)

export const getAction = async (actionId: string) => {
  const [action] = await db
    .select()
    .from(actionsTable)
    .where(eq(actionsTable.id, actionId))
    .limit(1)

  return action
}

export const getAvailableActions = async () => {
  return await db.select().from(actionsTable).where(isNull(actionsTable.trigger))
}

export const getActionsForTrigger = async (trigger: string) => {
  return await db.select().from(actionsTable).where(eq(actionsTable.trigger, trigger))
}

export const getSignerForFid = async (fid: number) => {
  const [signer] = await db
    .select()
    .from(farcasterAccountsTable)
    .where(eq(farcasterAccountsTable.fid, fid))

  return signer
}

export const createPost = async (
  params: Omit<typeof postsTable.$inferInsert, 'created_at' | 'updated_at'>
) => {
  await db
    .insert(postsTable)
    .values(params)
    .onConflictDoUpdate({ target: [postsTable.hash], set: { deleted_at: null } })
}

export const deletePost = async (hash: string) => {
  await db
    .update(postsTable)
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where(eq(postsTable.hash, hash))
}

export const getPost = async (hash: string): Promise<Post | null> => {
  const [post] = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.hash, hash), isNull(postsTable.deleted_at)))
    .limit(1)
  return post as Post | null
}

export const getBulkPosts = async (hashes: string[]) => {
  return await db
    .select()
    .from(postsTable)
    .where(and(inArray(postsTable.hash, hashes), isNull(postsTable.deleted_at)))
}

export const getPostChildren = async (hashes: string[]) => {
  return await db
    .select()
    .from(postRelationshipsTable)
    .where(
      and(
        inArray(postRelationshipsTable.post_hash, hashes),
        isNull(postRelationshipsTable.deleted_at)
      )
    )
}

export const getPostParent = async (hash: string) => {
  const [parent] = await db
    .select()
    .from(postRelationshipsTable)
    .where(eq(postRelationshipsTable.target_id, hash))
    .limit(1)
  return parent
}

export const getPostParentAndSiblings = async (hashes: string[]) => {
  const parents = await db
    .select()
    .from(postRelationshipsTable)
    .where(
      and(
        inArray(postRelationshipsTable.target_id, hashes),
        isNull(postRelationshipsTable.deleted_at)
      )
    )
  const children = await getPostChildren(parents.map((p) => p.post_hash))

  const result: Record<
    string,
    {
      siblings: (typeof postRelationshipsTable.$inferSelect)[]
      parent: typeof postRelationshipsTable.$inferSelect
    }
  > = {}
  for (const hash of hashes) {
    const parent = parents.find((p) => p.target_id === hash)
    if (!parent) continue
    const siblings = children.filter(
      (c) => c.post_hash === parent.post_hash && c.target_id !== hash
    )
    result[hash] = {
      siblings,
      parent,
    }
  }

  return result
}

export const revealPost = async (
  hash: string,
  revealMetadata: {
    message: string
    phrase: string
    signature: string
    address: string
  }
) => {
  await db
    .update(postsTable)
    .set({ reveal_metadata: revealMetadata, updated_at: new Date() })
    .where(eq(postsTable.hash, hash))
}

export const logActionExecution = async (
  params: Omit<typeof actionExecutionsTable.$inferInsert, 'created_at' | 'updated_at'>
) => {
  await db.insert(actionExecutionsTable).values(params)
}

export const createPostRelationship = async (
  params: Omit<typeof postRelationshipsTable.$inferInsert, 'created_at' | 'updated_at'>
) => {
  await db
    .insert(postRelationshipsTable)
    .values(params)
    .onConflictDoUpdate({
      target: [
        postRelationshipsTable.post_hash,
        postRelationshipsTable.target,
        postRelationshipsTable.target_account,
      ],
      set: { deleted_at: null },
    })
}

export const getPostRelationship = async (
  postHash: string,
  target: string,
  targetAccount: string
) => {
  const [relationship] = await db
    .select()
    .from(postRelationshipsTable)
    .where(
      and(
        eq(postRelationshipsTable.post_hash, postHash),
        eq(postRelationshipsTable.target, target),
        eq(postRelationshipsTable.target_account, targetAccount),
        isNull(postRelationshipsTable.deleted_at)
      )
    )
    .limit(1)
  return relationship
}

export const deletePostRelationship = async (target: string, targetId: string) => {
  await db
    .update(postRelationshipsTable)
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where(
      and(
        eq(postRelationshipsTable.target_id, targetId),
        eq(postRelationshipsTable.target, target)
      )
    )
}

export const getAllFarcasterAccounts = async () => {
  return await db.select().from(farcasterAccountsTable)
}

export const createPostCredentials = async (
  hash: string,
  credentials: CredentialInstance[]
) => {
  await db.insert(postCredentialsTable).values(
    credentials.map((credential) => ({
      post_hash: hash,
      credential_id: credential.id,
    }))
  )
}

export const getPostCredentials = async (hashes: string[]) => {
  const postCredentials = await db
    .select()
    .from(postCredentialsTable)
    .where(inArray(postCredentialsTable.post_hash, hashes))

  const credentialIds = postCredentials.map((p) => p.credential_id!).filter(Boolean)

  const credentials = await db
    .select()
    .from(credentialInstancesTable)
    .where(inArray(credentialInstancesTable.id, credentialIds))

  return hashes.map((hash) => ({
    hash,
    credentials: postCredentials
      .filter((p) => p.post_hash === hash)
      .map((p) => p.credential_id!)
      .filter(Boolean)
      .map((id) => credentials.find((c) => c.id === id)!)
      .filter(Boolean),
  }))
}

export const getTwitterAccount = async (username: string) => {
  const [account] = await db
    .select()
    .from(twitterAccountsTable)
    .where(eq(twitterAccountsTable.username, username))
  return account
}

export const getCredentialInstance = async (id: string) => {
  const [credential] = await db
    .select()
    .from(credentialInstancesTable)
    .where(eq(credentialInstancesTable.id, id))
    .limit(1)

  return credential
}

export const createCredentialInstance = async (
  params: Omit<typeof credentialInstancesTable.$inferInsert, 'created_at' | 'updated_at'>
) => {
  const [credential] = await db
    .insert(credentialInstancesTable)
    .values(params)
    .returning()
  return credential
}

export const getCredentials = async (ids: string[]) => {
  return await db
    .select()
    .from(credentialInstancesTable)
    .where(inArray(credentialInstancesTable.id, ids))
}
