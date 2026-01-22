// Shared types for core module

// Proof freshness thresholds
export const FRESHNESS_THRESHOLDS = {
  SAFE: 100,      // > 100 deposits until expiry = safe
  WARNING: 50,    // 50-100 = warning
  URGENT: 10,     // 10-50 = urgent
  CRITICAL: 0,    // < 10 = critical
} as const

export type RootFreshness = {
  exists: boolean
  depositsAgo: number
  depositsUntilExpiry: number
  status: 'safe' | 'warning' | 'urgent' | 'critical' | 'expired'
  message: string
}

export type TransferPreparation = {
  inputNote: {
    secret: bigint
    nullifier: bigint
    commitment: bigint
    amount: bigint
    leafIndex: number
    timestamp: number
  }
  changeNote: { secret: bigint; nullifier: bigint; commitment: bigint; amount: bigint }
  changeIndex: number
  outputCommitment: bigint
  merkleProof: { path: bigint[]; indices: number[]; root: bigint }
  nullifierHash: bigint
}

export type WithdrawPreparationData = {
  inputNote: {
    secret: bigint
    nullifier: bigint
    commitment: bigint
    amount: bigint
    leafIndex: number
    timestamp: number
  }
  merkleProof: { path: bigint[]; indices: number[]; root: bigint }
  nullifierHash: bigint
}

/**
 * Get freshness status and message for a root
 */
export function getRootFreshnessStatus(
  exists: boolean,
  depositsUntilExpiry: number
): { status: RootFreshness['status']; message: string } {
  if (!exists) {
    return {
      status: 'expired',
      message: 'This proof has expired. Please regenerate with the current merkle root.',
    }
  } else if (depositsUntilExpiry > FRESHNESS_THRESHOLDS.SAFE) {
    return {
      status: 'safe',
      message: `Proof is fresh (${depositsUntilExpiry} deposits until expiry)`,
    }
  } else if (depositsUntilExpiry > FRESHNESS_THRESHOLDS.WARNING) {
    return {
      status: 'warning',
      message: `Proof will expire soon (${depositsUntilExpiry} deposits remaining). Consider regenerating.`,
    }
  } else if (depositsUntilExpiry > FRESHNESS_THRESHOLDS.CRITICAL) {
    return {
      status: 'urgent',
      message: `Proof expiring very soon! Only ${depositsUntilExpiry} deposits until expiry. Regenerate now.`,
    }
  } else {
    return {
      status: 'critical',
      message: `Proof about to expire! Less than 10 deposits until expiry. Regenerate immediately.`,
    }
  }
}
