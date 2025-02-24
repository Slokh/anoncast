import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const CREATE_POST_ACTION_ID = 'b6ec8ee8-f8bf-474f-8b28-f788f37e4066'

export const TICKER = 'ANON'
export const TOKEN_ADDRESS = '0x0db510e79909666d6dec7f5e49370838c16d950f'
export const POST_AMOUNT = '5000000000000000000000'
export const LAUNCH_AMOUNT = '2000000000000000000000000'
export const PROMOTE_AMOUNT = '2000000000000000000000000'
export const DELETE_AMOUNT = '2000000000000000000000000'
export const FARC_USERNAME = 'anoncast'
export const FID = 883287
export const BEST_OF_FID = 884230
export const LAUNCH_FID = 883713

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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
