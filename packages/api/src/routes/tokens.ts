import { createElysia } from '../utils'
import {
  concat,
  createPublicClient,
  hexToBigInt,
  http,
  keccak256,
  pad,
  toHex,
} from 'viem'
import { base } from 'viem/chains'
import { simplehash } from '../services/simplehash'
import { t } from 'elysia'
import { redis } from '../services/redis'
import { zerion } from '../services/zerion'

const client = createPublicClient({
  chain: base,
  transport: http(),
})

export const tokenRoutes = createElysia({ prefix: '/tokens' })
  .get(
    '/:chainId/:tokenAddress',
    async ({ params, error }) => {
      const chainId = params.chainId
      const tokenAddress = params.tokenAddress

      const token = await redis.getToken(chainId, tokenAddress)
      if (token) return JSON.parse(token)

      const response = await zerion.getFungible(chainId, tokenAddress)
      if (!response) return error(404, 'Token not found')

      await redis.setToken(chainId, tokenAddress, JSON.stringify(response))

      return response
    },
    {
      params: t.Object({
        chainId: t.Number(),
        tokenAddress: t.String(),
      }),
    }
  )
  .get(
    '/:chainId/:tokenAddress/balance-slot',
    async ({ params, error }) => {
      const chainId = params.chainId
      const tokenAddress = params.tokenAddress

      const slot = await redis.getBalanceStorageSlot(chainId, tokenAddress)
      if (slot) return { slot: Number(slot) }

      const topHolder = await simplehash.getTopHolder(chainId, tokenAddress)

      for (let slot = 0; slot < 10; slot++) {
        const storageKey = keccak256(concat([pad(topHolder.address), pad(toHex(slot))]))
        const data = await client.getStorageAt({
          address: tokenAddress as `0x${string}`,
          slot: storageKey,
        })
        if (!data) continue
        if (hexToBigInt(data) === topHolder.balance) {
          await redis.setBalanceStorageSlot(chainId, tokenAddress, slot)
          return { slot }
        }
      }

      return error(404, 'Failed to find balance storage slot')
    },
    {
      params: t.Object({
        chainId: t.Number(),
        tokenAddress: t.String(),
      }),
    }
  )
