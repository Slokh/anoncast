'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ProverMode } from '@/lib/prover'

const STORAGE_KEY = 'anon:proofMode'
const VALID_MODES: ProverMode[] = ['main', 'server']
const DEFAULT_MODE: ProverMode = 'server' // Default to fast (server) mode

// User-friendly names for the modes
export const PROOF_MODE_INFO = {
  server: {
    label: 'Fast',
    description: 'Your data is anonymously proxied through our servers.',
  },
  main: {
    label: 'Slow',
    description: 'Your data never leaves your device.',
  },
} as const

// Helper to get initial mode from localStorage
function getInitialMode(): ProverMode {
  if (typeof window === 'undefined') return DEFAULT_MODE
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && VALID_MODES.includes(stored as ProverMode)) {
    return stored as ProverMode
  }
  return DEFAULT_MODE
}

export function useProofMode() {
  const [mode, setModeState] = useState<ProverMode>(getInitialMode)

  // Listen for changes from other components
  useEffect(() => {
    const handleChange = () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && VALID_MODES.includes(stored as ProverMode)) {
        setModeState(stored as ProverMode)
      }
    }

    window.addEventListener('proofModeChange', handleChange)
    return () => window.removeEventListener('proofModeChange', handleChange)
  }, [])

  const setMode = useCallback((newMode: ProverMode) => {
    if (VALID_MODES.includes(newMode)) {
      localStorage.setItem(STORAGE_KEY, newMode)
      setModeState(newMode)
      window.dispatchEvent(new Event('proofModeChange'))
    }
  }, [])

  return {
    mode,
    setMode,
    isFast: mode === 'server',
    isPrivate: mode === 'main',
  }
}

// Export a function to get the current mode outside of React
export function getProofMode(): ProverMode {
  if (typeof window === 'undefined') return DEFAULT_MODE
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && VALID_MODES.includes(stored as ProverMode)) {
    return stored as ProverMode
  }
  return DEFAULT_MODE
}
