'use client'

import { useEffect, useState } from 'react'

export function ShutdownBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      if (hostname === 'anon.world' || hostname === 'www.anon.world') {
        setShow(true)
      }
    }
  }, [])

  if (!show) return null

  return (
    <div className="bg-primary px-4 py-3 text-center text-sm text-primary-foreground">
      <p>
        <strong>anon.world</strong> has been shut down.{' '}
        <a href="https://anoncast.org" className="underline hover:opacity-80">
          anoncast
        </a>{' '}
        lives on.
      </p>
    </div>
  )
}
