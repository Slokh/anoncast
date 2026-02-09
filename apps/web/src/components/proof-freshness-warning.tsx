'use client'

import { RootFreshness } from '@/providers/privacy-wallet'

type ProofFreshnessWarningProps = {
  freshness: RootFreshness | null
  onRegenerate?: () => void
  className?: string
}

export function ProofFreshnessWarning({
  freshness,
  onRegenerate,
  className = '',
}: ProofFreshnessWarningProps) {
  if (!freshness) return null

  // Don't show anything if proof is safe
  if (freshness.status === 'safe') return null

  const statusStyles = {
    warning: {
      container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      icon: '⚠️',
      title: 'Proof Expiring Soon',
    },
    urgent: {
      container: 'bg-orange-50 border-orange-200 text-orange-800',
      icon: '🔶',
      title: 'Proof Expiring Very Soon',
    },
    critical: {
      container: 'bg-red-50 border-red-200 text-red-800',
      icon: '🔴',
      title: 'Proof Almost Expired',
    },
    expired: {
      container: 'bg-red-100 border-red-300 text-red-900',
      icon: '❌',
      title: 'Proof Expired',
    },
    safe: {
      container: '',
      icon: '',
      title: '',
    },
  }

  const style = statusStyles[freshness.status]

  return (
    <div className={`rounded-lg border p-4 ${style.container} ${className}`} role="alert">
      <div className="flex items-start gap-3">
        <span className="text-xl" aria-hidden="true">
          {style.icon}
        </span>
        <div className="flex-1">
          <h4 className="font-semibold">{style.title}</h4>
          <p className="text-sm mt-1">{freshness.message}</p>

          {freshness.status !== 'expired' && (
            <p className="text-xs mt-2 opacity-75">
              {freshness.depositsUntilExpiry} deposits until expiry • {freshness.depositsAgo}{' '}
              deposits since this root
            </p>
          )}

          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className={`mt-3 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                freshness.status === 'expired'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-white border border-current hover:bg-gray-50'
              }`}
            >
              {freshness.status === 'expired' ? 'Regenerate Proof' : 'Regenerate Now'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Inline freshness indicator for compact displays
 */
export function ProofFreshnessIndicator({ freshness }: { freshness: RootFreshness | null }) {
  if (!freshness) return null

  const statusConfig = {
    safe: { color: 'text-green-600', label: 'Fresh' },
    warning: { color: 'text-yellow-600', label: 'Expiring' },
    urgent: { color: 'text-orange-600', label: 'Urgent' },
    critical: { color: 'text-red-600', label: 'Critical' },
    expired: { color: 'text-red-700', label: 'Expired' },
  }

  const config = statusConfig[freshness.status]

  return (
    <span className={`text-sm font-medium ${config.color}`} title={freshness.message}>
      {config.label}
    </span>
  )
}
