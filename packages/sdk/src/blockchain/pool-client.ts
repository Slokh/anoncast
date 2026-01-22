// Pool client for interacting with AnonPool contract using viem
// This is a framework-agnostic client that can be used with any wallet adapter

import {
  createPublicClient,
  http,
  pad,
  toHex,
  type PublicClient,
  type Chain,
} from 'viem'
import { ANON_POOL_ABI, ERC20_ABI } from '../config/contracts'
import type { PoolStats, RootStatus } from './types'

export type AnonPoolClientConfig = {
  poolAddress: `0x${string}`
  tokenAddress: `0x${string}`
  rpcUrl?: string
  chain?: Chain
}

/**
 * Client for reading AnonPool contract state
 * For write operations, use wagmi's useWriteContract or similar
 */
export class AnonPoolClient {
  private client: PublicClient
  private poolAddress: `0x${string}`
  private tokenAddress: `0x${string}`

  constructor(config: AnonPoolClientConfig) {
    this.poolAddress = config.poolAddress
    this.tokenAddress = config.tokenAddress

    this.client = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    })
  }

  /**
   * Get pool statistics
   */
  async getPoolStats(): Promise<PoolStats> {
    const result = await this.client.readContract({
      address: this.poolAddress,
      abi: ANON_POOL_ABI,
      functionName: 'getPoolStats',
    })

    const [totalDeposited, leafCount, currentRoot, treeCapacity] = result as [bigint, number, `0x${string}`, number]

    return {
      totalDeposited,
      leafCount,
      currentRoot,
      treeCapacity,
    }
  }

  /**
   * Get the last (most recent) merkle root
   */
  async getLastRoot(): Promise<`0x${string}`> {
    return await this.client.readContract({
      address: this.poolAddress,
      abi: ANON_POOL_ABI,
      functionName: 'getLastRoot',
    }) as `0x${string}`
  }

  /**
   * Check if a merkle root is known/valid
   */
  async isKnownRoot(root: bigint): Promise<boolean> {
    const rootBytes = pad(toHex(root), { size: 32 }) as `0x${string}`
    return await this.client.readContract({
      address: this.poolAddress,
      abi: ANON_POOL_ABI,
      functionName: 'isKnownRoot',
      args: [rootBytes],
    }) as boolean
  }

  /**
   * Get root status (freshness information)
   */
  async getRootStatus(root: bigint): Promise<RootStatus> {
    const rootBytes = pad(toHex(root), { size: 32 }) as `0x${string}`
    const result = await this.client.readContract({
      address: this.poolAddress,
      abi: ANON_POOL_ABI,
      functionName: 'getRootStatus',
      args: [rootBytes],
    })

    const [exists, depositsAgo, depositsUntilExpiry] = result as [boolean, number, number]

    return {
      exists,
      depositsAgo,
      depositsUntilExpiry,
    }
  }

  /**
   * Check if a nullifier has been spent
   */
  async isNullifierSpent(nullifierHash: bigint): Promise<boolean> {
    const nullifierBytes = pad(toHex(nullifierHash), { size: 32 }) as `0x${string}`
    return await this.client.readContract({
      address: this.poolAddress,
      abi: ANON_POOL_ABI,
      functionName: 'nullifierSpent',
      args: [nullifierBytes],
    }) as boolean
  }

  /**
   * Get commitment data (check if a commitment exists)
   */
  async getCommitmentData(commitment: bigint): Promise<{ exists: boolean; leafIndex: number }> {
    const commitmentBytes = pad(toHex(commitment), { size: 32 }) as `0x${string}`
    const result = await this.client.readContract({
      address: this.poolAddress,
      abi: ANON_POOL_ABI,
      functionName: 'getCommitmentData',
      args: [commitmentBytes],
    })

    const [exists, leafIndex] = result as [boolean, number]
    return { exists, leafIndex }
  }

  /**
   * Get token balance for an address
   */
  async getTokenBalance(address: `0x${string}`): Promise<bigint> {
    return await this.client.readContract({
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as bigint
  }

  /**
   * Get token allowance for the pool
   */
  async getTokenAllowance(owner: `0x${string}`): Promise<bigint> {
    return await this.client.readContract({
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, this.poolAddress],
    }) as bigint
  }

  /**
   * Prepare deposit transaction data
   */
  prepareDepositTx(commitment: bigint, amount: bigint) {
    const commitmentBytes = pad(toHex(commitment), { size: 32 }) as `0x${string}`

    return {
      address: this.poolAddress,
      abi: ANON_POOL_ABI,
      functionName: 'deposit' as const,
      args: [commitmentBytes, amount] as const,
    }
  }

  /**
   * Prepare withdraw transaction data
   */
  prepareWithdrawTx(
    proof: Uint8Array,
    nullifierHash: bigint,
    merkleRoot: bigint,
    amount: bigint,
    recipient: `0x${string}`
  ) {
    const nullifierBytes = pad(toHex(nullifierHash), { size: 32 }) as `0x${string}`
    const rootBytes = pad(toHex(merkleRoot), { size: 32 }) as `0x${string}`

    return {
      address: this.poolAddress,
      abi: ANON_POOL_ABI,
      functionName: 'withdraw' as const,
      args: [toHex(proof), nullifierBytes, rootBytes, amount, recipient] as const,
    }
  }

  /**
   * Prepare approve transaction data
   */
  prepareApproveTx(amount: bigint) {
    return {
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve' as const,
      args: [this.poolAddress, amount] as const,
    }
  }
}
