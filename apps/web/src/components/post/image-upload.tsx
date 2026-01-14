'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

type ImageUploadProps = {
  onUpload: (url: string) => void
  onCancel: () => void
}

export function ImageUpload({ onUpload, onCancel }: ImageUploadProps) {
  const [error, setError] = useState<string | null>(null)
  const [fileSelected, setFileSelected] = useState(false)
  const [pickerOpened, setPickerOpened] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-open file picker on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.click()
      setPickerOpened(true)
    }, 50)

    return () => clearTimeout(timer)
  }, [])

  // Detect when file picker is cancelled (only after picker has opened)
  useEffect(() => {
    if (!pickerOpened) return

    const handleFocus = () => {
      setTimeout(() => {
        if (!fileSelected) {
          onCancel()
        }
      }, 300)
    }

    window.addEventListener('focus', handleFocus, { once: true })
    return () => window.removeEventListener('focus', handleFocus)
  }, [pickerOpened, fileSelected, onCancel])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileSelected(true)

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB')
      return
    }

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await response.json()
      onUpload(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  // Only show UI if there's an error
  if (!error) {
    return (
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    )
  }

  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm text-destructive">{error}</span>
        <button
          onClick={onCancel}
          className="cursor-pointer rounded-full bg-accent p-1.5 hover:bg-accent/70"
        >
          <X className="h-3 w-3" strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
