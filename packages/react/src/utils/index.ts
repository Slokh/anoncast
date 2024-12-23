import { base } from 'viem/chains'
import { Action, Cast, Credential } from '../types'
import { extractChain } from 'viem/utils'

export const chains = [base]

export function timeAgo(timestamp: string): string {
  const now = new Date()
  const past = new Date(timestamp)
  const seconds = Math.floor((now.getTime() - past.getTime()) / 1000)

  const intervals = [
    { label: 'y', seconds: 31536000 },
    { label: 'mo', seconds: 2592000 },
    { label: 'd', seconds: 86400 },
    { label: 'h', seconds: 3600 },
    { label: 'm', seconds: 60 },
    { label: 's', seconds: 1 },
  ]

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds)
    if (count >= 1) {
      return `${count}${interval.label} ago`
    }
  }

  return 'just now'
}

export function formatAmount(num: number): string {
  if (num < 1000) return num.toString()
  const units = ['K', 'M', 'B', 'T']
  const unitIndex = Math.floor(Math.log10(num) / 3) - 1
  const unitValue = 1000 ** (unitIndex + 1)
  const formattedNumber = (num / unitValue).toFixed(1)
  return `${formattedNumber}${units[unitIndex]}`
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function getUsableCredential(credentials: Credential[], action: Action) {
  if (!action.credential_id || credentials.length === 0) {
    return
  }

  for (const credential of credentials) {
    if (
      credential.credential_id === action.credential_id &&
      action.credential_requirement?.minimumBalance &&
      BigInt(credential.metadata.balance) >=
        BigInt(action.credential_requirement.minimumBalance)
    ) {
      return credential
    }
  }
}

export function formatHexId(hex: string) {
  let str = ''
  for (let i = 2; i < hex.length - 1; i += 2) {
    const num = Number.parseInt(hex.slice(i, i + 2), 16)
    if (!Number.isNaN(num)) {
      const code = num % 62
      if (code < 26) {
        str += String.fromCharCode(97 + code)
      } else if (code < 52) {
        str += String.fromCharCode(65 + (code - 26))
      } else {
        str += String.fromCharCode(48 + (code - 52))
      }
    }
  }
  return str.slice(0, 8)
}

export function toHslColors(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return {
    background: `hsl(${hue}, 70%, 85%)`,
    color: `hsl(${hue}, 70%, 15%)`,
  }
}
