import { t } from 'elysia'
import { createElysia } from '../utils'
import { db } from '../db'
import { provisioning } from '../services/provisioning'
import { neynar } from '../services/neynar'
import { ActionType, Token } from '@anonworld/common'
import { tokens } from '../services/tokens'
import { parseUnits } from 'viem'

const ANONWORLD_FID = 884230

export const communitiesRoutes = createElysia({ prefix: '/communities' })
  .get('/', async () => {
    const communities = await db.communities.list()
    return {
      data: communities,
    }
  })
  .get(
    '/:id',
    async ({ params }) => {
      const community = await db.communities.get(params.id)
      return community
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  .post(
    '/',
    async ({ body }) => {
      let token: Token | undefined
      if (body.existingToken) {
        token = await tokens.getOrCreate(body.existingToken)
        if (!token) {
          throw new Error('Failed to find token')
        }
      } else if (!body.newToken) {
        throw new Error('No token provided')
      }

      let fid: number | null = null
      let walletId: string | null = null
      let walletAddress: string | null = null

      const account = await db.socials.getFarcasterAccountByUsername(body.username)
      if (account) {
        const community = await db.communities.getForAccounts([account.fid], [])
        if (community.length === 0) {
          fid = account.fid
          walletId = account.custody_wallet_id
          walletAddress = account.custody_address
        }
      }

      if (!fid || !walletId || !walletAddress) {
        const newAccount = await provisioning.deployFarcasterAccount({
          name: body.name,
          description: body.description,
          imageUrl: body.imageUrl,
          username: body.username,
          url: `https://anon.world/communities/${body.username}`,
        })
        fid = newAccount.fid
        walletId = newAccount.walletId
        walletAddress = newAccount.walletAddress
      }

      if (body.newToken) {
        token = await provisioning.deployToken({
          name: body.name,
          symbol: body.newToken.symbol,
          imageUrl: body.imageUrl,
          creatorAddress: walletAddress as `0x${string}`,
          creatorFid: fid,
        })
      }

      if (!token) {
        throw new Error('Failed to deploy token')
      }

      const community = await db.communities.create({
        name: body.name,
        description: body.description,
        image_url: body.imageUrl,
        token_id: token.id,
        fid,
        passkey_id: body.passkeyId,
        wallet_id: walletId,
        wallet_address: walletAddress,
        posts: 0,
        followers: 0,
      })

      await db.actions.create({
        community_id: community.id,
        type: ActionType.COPY_POST_FARCASTER,
        credential_id: `${token.type}_BALANCE:${token.chain_id}:${token.address.toLowerCase()}`,
        credential_requirement: {
          chainId: token.chain_id,
          tokenAddress: token.address as `0x${string}`,
          minimumBalance: parseUnits(body.minimumBalance, token.decimals).toString(),
        },
        trigger: 'b6ec8ee8-f8bf-474f-8b28-f788f37e4066',
        metadata: {
          fid: community.fid,
        },
      })

      let text = `👋 This is the community account for ${body.name}.`
      text += ` Requires ${body.minimumBalance} ${token.symbol} to post to it using @anonworld.`

      const communityFirstCast = {
        links: [`https://anon.world/communities/${community.id}`],
        reply: null,
        text,
        images: [],
      }

      const response = await neynar.createCast({
        fid,
        ...communityFirstCast,
      })

      if (response.success) {
        await db.posts.create({
          hash: response.cast.hash,
          fid,
          data: communityFirstCast,
        })

        const anonWorldCast = {
          links: [`https://anon.world/communities/${community.id}`],
          reply: null,
          text: `🌐 New community launched: @${body.username}`,
          quote: {
            fid: response.cast.author.fid,
            hash: response.cast.hash,
          },
          images: [],
        }

        const anonWorldAnnouncement = await neynar.createCast({
          fid: ANONWORLD_FID,
          ...anonWorldCast,
        })

        if (anonWorldAnnouncement.success) {
          await db.posts.create({
            hash: anonWorldAnnouncement.cast.hash,
            fid: ANONWORLD_FID,
            data: anonWorldCast,
          })
        }
      }

      return await db.communities.get(community.id)
    },
    {
      body: t.Object({
        passkeyId: t.Optional(t.String()),
        name: t.String(),
        description: t.String(),
        imageUrl: t.String(),
        username: t.String(),
        newToken: t.Optional(
          t.Object({
            symbol: t.String(),
          })
        ),
        existingToken: t.Optional(
          t.Object({
            contractType: t.String(),
            chainId: t.Number(),
            address: t.String(),
          })
        ),
        minimumBalance: t.String(),
      }),
    }
  )
  .get(
    '/:id/actions',
    async ({ params }) => {
      const data = await db.actions.listByCommunity(params.id)
      return { data }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  .post(
    '/:id/actions',
    async ({ body, params, passkeyId }) => {
      const community = await db.communities.get(params.id)
      if (!community) {
        throw new Error('Community not found')
      }

      if (!community.passkey_id) {
        throw new Error('Community is not editable')
      }

      if (community.passkey_id !== passkeyId) {
        throw new Error('Invalid passkey')
      }

      const action = await db.actions.getByCommunityAndType(params.id, body.type)
      if (action) {
        await db.actions.update(action.id, {
          credential_id: body.credentialId,
          credential_requirement: body.credentialRequirement,
        })
      } else if (body.type === ActionType.COPY_POST_FARCASTER) {
        await db.actions.create({
          community_id: params.id,
          type: body.type,
          credential_id: body.credentialId,
          credential_requirement: body.credentialRequirement,
          trigger: 'b6ec8ee8-f8bf-474f-8b28-f788f37e4066',
          metadata: {
            fid: community.fid,
          },
        })
      }

      return action
    },
    {
      body: t.Object({
        type: t.String(),
        credentialId: t.String(),
        credentialRequirement: t.Any(),
      }),
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  .delete(
    '/:id/actions/:actionId',
    async ({ params, passkeyId }) => {
      const action = await db.actions.get(params.actionId)
      if (action?.community_id) {
        const community = await db.communities.get(action.community_id)
        if (community?.passkey_id === passkeyId) {
          await db.actions.delete(params.actionId)
        }
      }
    },
    {
      params: t.Object({
        id: t.String(),
        actionId: t.String(),
      }),
    }
  )
