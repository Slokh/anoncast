'use client'

import { ExternalLink, X } from 'lucide-react'

type EmbedPreviewProps = {
  url: string
  onRemove: () => void
}

function getEmbedType(url: string): 'farcaster' | 'twitter' | 'link' {
  try {
    const parsed = new URL(url)

    if (
      parsed.hostname === 'warpcast.com' &&
      (parsed.pathname.match(/^\/[^/]+\/0x[a-f0-9]+$/) ||
        parsed.pathname.match(/^\/~\/conversations\/0x[a-f0-9]+$/))
    ) {
      return 'farcaster'
    }

    if (
      (parsed.hostname === 'twitter.com' || parsed.hostname === 'x.com') &&
      parsed.pathname.match(/\/status\/\d+/)
    ) {
      return 'twitter'
    }

    return 'link'
  } catch {
    return 'link'
  }
}

function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.length > 20 ? parsed.pathname.slice(0, 20) + '...' : parsed.pathname
    return parsed.hostname + path
  } catch {
    return url.slice(0, 30) + '...'
  }
}

export function EmbedPreview({ url, onRemove }: EmbedPreviewProps) {
  const embedType = getEmbedType(url)

  const typeLabels = {
    farcaster: 'Farcaster Cast',
    twitter: 'Tweet',
    link: 'Link',
  }

  return (
    <div className="rounded-lg border border-border bg-muted p-2">
      <div className="flex items-center gap-2">
        <ExternalLink className="h-4 w-4 text-foreground" />
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="text-xs text-muted-foreground">{typeLabels[embedType]}</span>
          <span className="truncate text-sm">{getDisplayUrl(url)}</span>
        </div>
        <button
          onClick={onRemove}
          className="cursor-pointer rounded-full bg-accent p-1.5 hover:bg-accent/70"
        >
          <X className="h-3 w-3" strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
