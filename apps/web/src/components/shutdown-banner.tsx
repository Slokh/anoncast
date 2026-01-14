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
    <div className="bg-orange-500 px-4 py-1.5 text-center text-xs font-medium text-white">
      <strong>anon.world</strong> has been shut down.{' '}
      <a href="https://anoncast.org" className="underline hover:opacity-80">
        anoncast
      </a>{' '}
      lives on.
    </div>
  )
}
