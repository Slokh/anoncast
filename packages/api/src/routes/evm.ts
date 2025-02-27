import { createElysia } from '../utils'
import { concat, erc20Abi, hexToNumber, keccak256, pad, toHex, zeroAddress } from 'viem'
import { simplehash } from '../services/simplehash'
import { t } from 'elysia'
import { redis } from '../services/redis'
import { db } from '../db'
import { getChain } from '@anonworld/common'
import { tokens } from '../services/tokens'
import { ContractType, StorageType } from '@anonworld/common'

export const evmRoutes = createElysia({ prefix: '/evm' }).post(
  '/storage-slot',
  async ({ body, error }) => {
    const chainId = body.chainId
    const contractAddress = body.contractAddress.toLowerCase()
    const contractType = body.contractType as ContractType
    const storageType = body.storageType as StorageType

    let cached = await redis.getStorageSlot(chainId, contractAddress, storageType)
    if (cached) {
      return {
        slot: hexToNumber(cached as `0x${string}`),
      }
    }

    let holder: { address: string; balance: bigint } | null = null

    const chain = getChain(chainId)

    let slot: number | null = null
    if (contractType === ContractType.ERC20) {
      if (!chain.simplehashSupportsTokens) {
        const balance = await chain.client.readContract({
          address: contractAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [zeroAddress],
        })
        if (balance !== BigInt(0)) {
          holder = {
            address: zeroAddress,
            balance: balance,
          }
        }
      } else {
        holder = await simplehash.getTopTokenHolder(chainId, contractAddress)
      }
    }
    if (contractType === ContractType.ERC721) {
      holder = await simplehash.getTopNFTHolder(chainId, contractAddress)
    }

    if (!holder) return error(404, 'Failed to find balance storage slot')

    slot = await getStorageSlot(chainId, contractAddress, holder.address, holder.balance)

    if (slot === null) return error(404, 'Failed to find balance storage slot')

    // await tokens.getOrCreate({
    //   contractType: contractType,
    //   chainId: chainId,
    //   address: contractAddress,
    // })

    // await db.tokens.update(`${chainId}:${contractAddress}`, {
    //   balance_slot: slot,
    // })

    // await redis.setStorageSlot(chainId, contractAddress, StorageType.BALANCE, toHex(slot))

    return { slot }
  },
  {
    body: t.Object({
      chainId: t.Number(),
      contractAddress: t.String(),
      contractType: t.String(),
      storageType: t.String(),
    }),
  }
)

async function getStorageSlot(
  chainId: number,
  contractAddress: string,
  walletAddress: string,
  value: bigint
) {
  const chain = getChain(chainId)

  let slotWithData = null

  // Milady Cult // unsupported in circuit because of storage key computation
  if (
    chainId === 1 &&
    contractAddress.toLowerCase() === '0x0000000000c5dc95539589fbd24be07c6c14eca4'
  ) {
    const seed = '0x87a211a2'
    const storageKey = keccak256(
      concat([walletAddress as `0x${string}`, pad(seed, { size: 12 })])
    )
    const data = await chain.client.getStorageAt({
      address: contractAddress as `0x${string}`,
      slot: storageKey,
    })

    if (data) {
      if (BigInt(data) === value) return null
    }
    return null
  }

  for (let slot = 0; slot < 200; slot++) {
    const storageKey = keccak256(
      concat([pad(walletAddress as `0x${string}`), pad(toHex(slot))])
    )
    const data = await chain.client.getStorageAt({
      address: contractAddress as `0x${string}`,
      slot: storageKey,
    })
    if (!data) continue

    const dataValue = BigInt(data)
    if (dataValue === BigInt(0)) continue

    if (slotWithData === null) {
      slotWithData = slot
    }

    if (dataValue === value) {
      return slot
    }
  }

  return slotWithData
}
