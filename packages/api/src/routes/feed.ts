import { Redis } from 'ioredis'
import { createElysia } from '../utils'
import { t } from 'elysia'
import { neynar } from '../services/neynar'
import { TOKEN_CONFIG } from '@anon/utils/src/config'

const redis = new Redis(process.env.REDIS_URL as string)

export const feedRoutes = createElysia({ prefix: '/feed' })
  .get(
    '/:tokenAddress/new',
    async ({ params }) => {
      const cached = await redis.get(`new:${params.tokenAddress}`)
      if (cached) {
        return JSON.parse(cached)
      }

      const response = await neynar.getUserCasts(TOKEN_CONFIG[params.tokenAddress].fid)
      await redis.set(`new:${params.tokenAddress}`, JSON.stringify(response), 'EX', 30)
      return response
    },
    {
      params: t.Object({
        tokenAddress: t.String(),
      }),
    }
  )
  .get(
    '/:tokenAddress/trending',
    async ({ params }) => {
      const trending = await redis.get(`trending:${params.tokenAddress}`)
      if (!trending) {
        return {
          casts: [],
        }
      }

      const castsWithScores: [string, number][] = JSON.parse(trending)
      const hashes = castsWithScores.map((cast) => cast[0])
      const response = await neynar.getBulkCasts(hashes)

      return {
        casts: response.result.casts,
      }
    },
    {
      params: t.Object({
        tokenAddress: t.String(),
      }),
    }
  )
  .get(
    '/:tokenAddress/coins',
    async ({ params }) => {
      const cached = await redis.get(`coins:${params.tokenAddress}`)
      if (cached) {
        return JSON.parse(cached)
      }

      const response = await neynar.getUserCasts(TOKEN_CONFIG[params.tokenAddress].fid)
      const filteredCasts = {
        casts: response.casts.filter(cast => cast.text.includes('@tokenbot'))
      }
      await redis.set(`coins:${params.tokenAddress}`, JSON.stringify(filteredCasts), 'EX', 30)
      return filteredCasts
    },
    {
      params: t.Object({
        tokenAddress: t.String(),
      }),
    }
  )
