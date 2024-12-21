import { createElysia } from '../utils'
import { t } from 'elysia'
import { verifyMessage } from 'viem'
import { neynar } from '../services/neynar'
import { getPost, revealPost } from '@anonworld/db'
import { formatPosts } from './feeds'

export const postsRoutes = createElysia({ prefix: '/posts' })
  .get(
    '/:hash',
    async ({ params }) => {
      const post = await getPost(params.hash)
      if (!post) {
        throw new Error('Post not found')
      }
      return (await formatPosts([post]))[0]
    },
    {
      params: t.Object({
        hash: t.String(),
      }),
    }
  )
  .post(
    '/reveal',
    async ({ body }) => {
      const post = await getPost(body.hash)
      if (!post) {
        throw new Error('Post not found')
      }

      const isValidSignature = await verifyMessage({
        message: body.message,
        signature: body.signature as `0x${string}`,
        address: body.address as `0x${string}`,
      })
      if (!isValidSignature) {
        return {
          success: false,
        }
      }

      const address = body.address.toLowerCase()
      let username: string | undefined

      try {
        const users = await neynar.getBulkUsers([address])
        username = users?.[address]?.[0]?.username
      } catch (error) {
        console.error(error)
      }

      await revealPost(body.hash, {
        message: body.message,
        phrase: body.phrase,
        signature: body.signature,
        address: body.address,
      })

      const response = await neynar.createCast({
        fid: post.fid,
        text: `REVEALED: Posted by ${username ? `@${username}` : `${address}`}`,
        embeds: [`https://anoncast.org/posts/${body.hash}`],
        quote: body.hash,
      })

      if (!response.success) {
        throw new Error('Failed to create cast')
      }

      return {
        success: true,
        hash: response.cast.hash,
      }
    },
    {
      body: t.Object({
        hash: t.String(),
        message: t.String(),
        phrase: t.String(),
        signature: t.String(),
        address: t.String(),
      }),
    }
  )
