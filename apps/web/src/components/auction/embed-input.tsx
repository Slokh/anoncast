'use client'

import { useState } from 'react'
import { Link2, X } from 'lucide-react'

type EmbedInputProps = {
  onSubmit: (url: string) => void
  onCancel: () => void
}

export function EmbedInput({ onSubmit, onCancel }: EmbedInputProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (value: string) => {
    setError(null)

    try {
      new URL(value)
    } catch {
      setError('Please enter a valid URL')
      return
    }

    onSubmit(value)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text')
    if (pastedText) {
      try {
        new URL(pastedText)
        // Valid URL - auto submit after a brief delay to let the paste complete
        setTimeout(() => handleSubmit(pastedText), 0)
      } catch {
        // Not a valid URL, let it paste normally
      }
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted p-2">
      <div className="flex items-center gap-2">
        <Link2 className={`h-4 w-4 ${url ? 'text-foreground' : 'text-muted-foreground'}`} />
        <input
          type="url"
          placeholder="Paste a link..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && handleSubmit(url)}
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          autoFocus
        />
        {url.trim() && (
          <button
            onClick={() => handleSubmit(url)}
            className="cursor-pointer rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Add
          </button>
        )}
        <button
          onClick={onCancel}
          className="cursor-pointer rounded-full bg-accent p-1.5 hover:bg-accent/70"
        >
          <X className="h-3 w-3" strokeWidth={3} />
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
