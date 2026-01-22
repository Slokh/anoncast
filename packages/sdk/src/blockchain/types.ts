// Types for blockchain interactions

import type { Note } from '../core/transfer'

export type DepositState =
  | 'idle'
  | 'checking_allowance'
  | 'approving'
  | 'waiting_approval'
  | 'depositing'
  | 'waiting_deposit'
  | 'success'
  | 'error'

export type DepositResult = {
  txHash: string
  commitment: bigint
  amount: bigint
  noteIndex: number
}

export type DepositParams = {
  amount: bigint
  commitment: bigint
  tokenAddress: `0x${string}`
  poolAddress: `0x${string}`
}

export type WithdrawState =
  | 'idle'
  | 'preparing'
  | 'generating_proof'
  | 'withdrawing'
  | 'waiting_withdraw'
  | 'success'
  | 'error'

export type WithdrawResult = {
  txHash: string
  amount: bigint
  recipient: string
}

export type WithdrawPreparation = {
  inputNote: Note
  merkleProof: { path: bigint[]; indices: number[]; root: bigint }
  nullifierHash: bigint
}

export type WithdrawParams = {
  proof: number[]
  nullifierHash: bigint
  merkleRoot: bigint
  amount: bigint
  recipient: `0x${string}`
  poolAddress: `0x${string}`
}

export type PoolStats = {
  totalDeposited: bigint
  leafCount: number
  currentRoot: `0x${string}`
  treeCapacity: number
}

export type RootStatus = {
  exists: boolean
  depositsAgo: number
  depositsUntilExpiry: number
}
