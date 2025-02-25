import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const CREATE_POST_ACTION_ID = 'b6ec8ee8-f8bf-474f-8b28-f788f37e4066'
export const DELETE_FROM_TWITTER_ACTION_ID = 'e917152f-cc37-42f0-a99c-c7d7745d29be'
export const COPY_TO_TWITTER_ACTION_ID = '57836c8c-e7a5-4c8f-97f9-06ca5fbaa8a6'
export const COPY_TO_ANONFUN_ACTION_ID = '4c2e9c3e-0b53-45c3-bcdd-4c9ec068da94'

export const TICKER = 'RUMOUR'
export const TOKEN_ADDRESS = '0x1CEcCbE4d3a19cB62DbBd09756A52Cfe5394Fab8'
export const POST_AMOUNT = '10000000000000000000000'
export const LAUNCH_AMOUNT = '10000000000000000000000000'
export const PROMOTE_AMOUNT = '10000000000000000000000000'
export const DELETE_AMOUNT = '10000000000000000000000000'
export const FARC_USERNAME = 'rumour'
export const FID = 884230
export const BEST_OF_FID = 884230
export const LAUNCH_FID = 884230

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
