'use client'

import { useState, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { formatUnits, maxUint256 } from 'viem'
import { TOKEN_DECIMALS } from '@/config/chains'

// Uniswap V3 on Base
const SWAP_ROUTER_02 = '0x2626664c2603336E57B271c5C0b26F421741e481' as const
const QUOTER_V2 = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as const
const WETH = '0x4200000000000000000000000000000000000006' as const
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
const ANON_TOKEN = '0x0Db510e79909666d6dEc7f5e49370838c16D950f' as const

// Pool fee tiers (1% = 10000, 0.3% = 3000, 0.05% = 500)
const WETH_ANON_FEE = 10000 // 1% for WETH/ANON
const USDC_ANON_FEE = 10000 // 1% for USDC/ANON (may need adjustment)

export type InputToken = 'ETH' | 'USDC'

export const INPUT_TOKENS = {
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    address: WETH,
    fee: WETH_ANON_FEE,
    isNative: true,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: USDC,
    fee: USDC_ANON_FEE,
    isNative: false,
  },
} as const

// ERC20 ABI for approval
const ERC20_ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// Quoter V2 ABI
const QUOTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactOutputSingle',
    outputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// SwapRouter02 ABI
const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountOut', type: 'uint256' },
          { name: 'amountInMaximum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactOutputSingle',
    outputs: [{ name: 'amountIn', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

export type SwapState = 'idle' | 'quoting' | 'approving' | 'swapping' | 'success' | 'error'

export type SwapMode = 'exactInput' | 'exactOutput'

export type SwapQuote = {
  mode: SwapMode
  inputToken: InputToken
  amountIn: bigint
  amountOut: bigint
  needsApproval: boolean
}

export function useSwap() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [state, setState] = useState<SwapState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Get quote for exact input (specify input amount, get output amount)
  const getQuoteExactInput = useCallback(
    async (inputToken: InputToken, amountIn: bigint): Promise<SwapQuote | null> => {
      if (!publicClient || !address || amountIn <= 0n) {
        setQuote(null)
        return null
      }

      const tokenConfig = INPUT_TOKENS[inputToken]
      setState('quoting')
      setError(null)

      try {
        const result = await publicClient.simulateContract({
          address: QUOTER_V2,
          abi: QUOTER_ABI,
          functionName: 'quoteExactInputSingle',
          args: [
            {
              tokenIn: tokenConfig.address,
              tokenOut: ANON_TOKEN,
              amountIn: amountIn,
              fee: tokenConfig.fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        })

        const amountOut = result.result[0]

        // Check if approval is needed for non-native tokens
        let needsApproval = false
        if (!tokenConfig.isNative) {
          const allowance = await publicClient.readContract({
            address: tokenConfig.address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, SWAP_ROUTER_02],
          })
          needsApproval = allowance < amountIn
        }

        const newQuote: SwapQuote = {
          mode: 'exactInput',
          inputToken,
          amountIn,
          amountOut,
          needsApproval,
        }

        setQuote(newQuote)
        setState('idle')
        return newQuote
      } catch (err) {
        console.error('Quote error:', err)
        setError('Failed to get quote. Pool may not exist or have liquidity.')
        setState('error')
        setQuote(null)
        return null
      }
    },
    [publicClient, address]
  )

  // Get quote for exact output (specify output amount, get input amount)
  const getQuoteExactOutput = useCallback(
    async (inputToken: InputToken, amountOut: bigint): Promise<SwapQuote | null> => {
      if (!publicClient || !address || amountOut <= 0n) {
        setQuote(null)
        return null
      }

      const tokenConfig = INPUT_TOKENS[inputToken]
      setState('quoting')
      setError(null)

      try {
        const result = await publicClient.simulateContract({
          address: QUOTER_V2,
          abi: QUOTER_ABI,
          functionName: 'quoteExactOutputSingle',
          args: [
            {
              tokenIn: tokenConfig.address,
              tokenOut: ANON_TOKEN,
              amount: amountOut,
              fee: tokenConfig.fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        })

        const amountIn = result.result[0]

        // Check if approval is needed for non-native tokens
        let needsApproval = false
        if (!tokenConfig.isNative) {
          const allowance = await publicClient.readContract({
            address: tokenConfig.address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, SWAP_ROUTER_02],
          })
          needsApproval = allowance < amountIn
        }

        const newQuote: SwapQuote = {
          mode: 'exactOutput',
          inputToken,
          amountIn,
          amountOut,
          needsApproval,
        }

        setQuote(newQuote)
        setState('idle')
        return newQuote
      } catch (err) {
        console.error('Quote error:', err)
        setError('Failed to get quote. Pool may not exist or have liquidity.')
        setState('error')
        setQuote(null)
        return null
      }
    },
    [publicClient, address]
  )

  // Approve token for swap
  const approveToken = useCallback(
    async (inputToken: InputToken): Promise<boolean> => {
      if (!walletClient || !publicClient) {
        setError('Wallet not connected')
        return false
      }

      const tokenConfig = INPUT_TOKENS[inputToken]
      if (tokenConfig.isNative) return true // ETH doesn't need approval

      setState('approving')
      setError(null)

      try {
        const hash = await walletClient.writeContract({
          address: tokenConfig.address,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [SWAP_ROUTER_02, maxUint256],
        })

        await publicClient.waitForTransactionReceipt({ hash })

        // Update quote to reflect approval
        if (quote) {
          setQuote({ ...quote, needsApproval: false })
        }

        setState('idle')
        return true
      } catch (err) {
        console.error('Approval error:', err)
        const message = err instanceof Error ? err.message : 'Approval failed'
        if (message.includes('user rejected')) {
          setError('Approval rejected')
        } else {
          setError('Failed to approve token')
        }
        setState('error')
        return false
      }
    },
    [walletClient, publicClient, quote]
  )

  // Execute exact input swap
  const executeSwapExactInput = useCallback(
    async (inputToken: InputToken, amountIn: bigint, minAmountOut: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient || !address) {
        setError('Wallet not connected')
        return false
      }

      const tokenConfig = INPUT_TOKENS[inputToken]
      setState('swapping')
      setError(null)

      try {
        const hash = await walletClient.writeContract({
          address: SWAP_ROUTER_02,
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [
            {
              tokenIn: tokenConfig.address,
              tokenOut: ANON_TOKEN,
              fee: tokenConfig.fee,
              recipient: address,
              amountIn: amountIn,
              amountOutMinimum: minAmountOut,
              sqrtPriceLimitX96: 0n,
            },
          ],
          value: tokenConfig.isNative ? amountIn : 0n,
        })

        setTxHash(hash)
        await publicClient.waitForTransactionReceipt({ hash })
        setState('success')
        return true
      } catch (err) {
        console.error('Swap error:', err)
        handleSwapError(err)
        return false
      }
    },
    [walletClient, publicClient, address]
  )

  // Execute exact output swap
  const executeSwapExactOutput = useCallback(
    async (inputToken: InputToken, amountOut: bigint, maxAmountIn: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient || !address) {
        setError('Wallet not connected')
        return false
      }

      const tokenConfig = INPUT_TOKENS[inputToken]
      setState('swapping')
      setError(null)

      try {
        const hash = await walletClient.writeContract({
          address: SWAP_ROUTER_02,
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactOutputSingle',
          args: [
            {
              tokenIn: tokenConfig.address,
              tokenOut: ANON_TOKEN,
              fee: tokenConfig.fee,
              recipient: address,
              amountOut: amountOut,
              amountInMaximum: maxAmountIn,
              sqrtPriceLimitX96: 0n,
            },
          ],
          value: tokenConfig.isNative ? maxAmountIn : 0n, // Send max ETH, excess is refunded
        })

        setTxHash(hash)
        await publicClient.waitForTransactionReceipt({ hash })
        setState('success')
        return true
      } catch (err) {
        console.error('Swap error:', err)
        handleSwapError(err)
        return false
      }
    },
    [walletClient, publicClient, address]
  )

  // Common error handler
  const handleSwapError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Swap failed'
    if (message.includes('user rejected')) {
      setError('Transaction rejected')
    } else if (message.includes('insufficient funds')) {
      setError('Insufficient balance')
    } else if (message.includes('Too little received') || message.includes('Too much requested')) {
      setError('Price moved too much. Try again.')
    } else {
      setError(message.length > 100 ? 'Swap failed. Try again.' : message)
    }
    setState('error')
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setError(null)
    setQuote(null)
    setTxHash(null)
  }, [])

  // Format helpers
  const formatTokenAmount = useCallback((amount: bigint) => {
    const formatted = formatUnits(amount, TOKEN_DECIMALS)
    const num = parseFloat(formatted)
    if (num < 0.01) return '<0.01'
    if (num < 100) return num.toFixed(2)
    return Math.floor(num).toLocaleString()
  }, [])

  return {
    state,
    error,
    quote,
    txHash,
    getQuoteExactInput,
    getQuoteExactOutput,
    approveToken,
    executeSwapExactInput,
    executeSwapExactOutput,
    reset,
    formatTokenAmount,
  }
}
