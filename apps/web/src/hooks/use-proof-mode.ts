'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ProverMode } from '@/lib/prover'

const STORAGE_KEY = 'anon:proofMode'
const VALID_MODES: ProverMode[] = ['main', 'server']
const DEFAULT_MODE: ProverMode = 'main'

export function useProofMode() {
  const [mode, setModeState] = useState<ProverMode>(DEFAULT_MODE)

  // Sync from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && VALID_MODES.includes(stored as ProverMode)) {
      setModeState(stored as ProverMode)
    }
  }, [])

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

  const toggleMode = useCallback(() => {
    const nextMode = mode === 'main' ? 'server' : 'main'
    setMode(nextMode)
  }, [mode, setMode])

  return {
    mode,
    setMode,
    toggleMode,
    isServer: mode === 'server',
    isClient: mode === 'main',
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
