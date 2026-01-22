'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/config/chains'

// ANON token on Base
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens/0x0Db510e79909666d6dEc7f5e49370838c16D950f'

type PriceData = {
  priceUsd: number
  priceChange24h: number
}

let cachedPrice: PriceData | null = null
let lastFetchTime = 0
const CACHE_DURATION = 60000 // 1 minute cache

export function useTokenPrice() {
  const [price, setPrice] = useState<PriceData | null>(cachedPrice)
  const [isLoading, setIsLoading] = useState(!cachedPrice)

  const fetchPrice = useCallback(async () => {
    const now = Date.now()

    // Use cache if fresh
    if (cachedPrice && now - lastFetchTime < CACHE_DURATION) {
      setPrice(cachedPrice)
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch(DEXSCREENER_API)
      if (res.ok) {
        const data = await res.json()
        // DexScreener returns pairs array, use the first/main pair
        const pair = data.pairs?.[0]
        if (pair) {
          const newPrice: PriceData = {
            priceUsd: parseFloat(pair.priceUsd) || 0,
            priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
          }
          cachedPrice = newPrice
          lastFetchTime = now
          setPrice(newPrice)
        }
      }
    } catch {
      // Silent fail, keep using cached price
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrice()

    // Refresh every minute
    const interval = setInterval(fetchPrice, CACHE_DURATION)
    return () => clearInterval(interval)
  }, [fetchPrice])

  // Format a bigint token amount to USD string
  const formatUsd = useCallback((amount: bigint): string => {
    if (!price?.priceUsd) return ''
    const tokenAmount = parseFloat(formatUnits(amount, TOKEN_DECIMALS))
    const usdValue = tokenAmount * price.priceUsd

    if (usdValue < 0.01) return '<$0.01'
    if (usdValue < 1) return `$${usdValue.toFixed(2)}`
    if (usdValue < 1000) return `$${usdValue.toFixed(2)}`
    if (usdValue < 10000) return `$${usdValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    return `$${(usdValue / 1000).toFixed(1)}k`
  }, [price])

  // Format a number (already in token units) to USD string
  const formatUsdFromNumber = useCallback((amount: number): string => {
    if (!price?.priceUsd) return ''
    const usdValue = amount * price.priceUsd

    if (usdValue < 0.01) return '<$0.01'
    if (usdValue < 1) return `$${usdValue.toFixed(2)}`
    if (usdValue < 1000) return `$${usdValue.toFixed(2)}`
    if (usdValue < 10000) return `$${usdValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    return `$${(usdValue / 1000).toFixed(1)}k`
  }, [price])

  return {
    price: price?.priceUsd ?? null,
    priceChange24h: price?.priceChange24h ?? null,
    isLoading,
    formatUsd,
    formatUsdFromNumber,
  }
}
