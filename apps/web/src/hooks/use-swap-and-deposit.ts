'use client'

import { useState, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { formatUnits, maxUint256, pad, toHex } from 'viem'
import { TOKEN_DECIMALS, CONTRACTS, IS_LOCAL } from '@/config/chains'
import { ANON_POOL_GATEWAY_ABI } from '@/config/contracts'

// Uniswap V3 Quoter on Base (for getting price quotes)
const QUOTER_V2 = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as const
const WETH = '0x4200000000000000000000000000000000000006' as const
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
const ANON_TOKEN = '0x0Db510e79909666d6dEc7f5e49370838c16D950f' as const

// Pool fee tier (1% = 10000)
const POOL_FEE = 10000

export type InputToken = 'ETH' | 'USDC'

export const INPUT_TOKENS = {
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    address: WETH,
    isNative: true,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: USDC,
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

// Quoter V2 ABI (same as Uniswap)
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

export type SwapAndDepositState = 'idle' | 'quoting' | 'approving' | 'depositing' | 'success' | 'error'

export type SwapMode = 'exactInput' | 'exactOutput'

export type SwapQuote = {
  mode: SwapMode
  inputToken: InputToken
  amountIn: bigint
  amountOut: bigint
  needsApproval: boolean
}

export function useSwapAndDeposit() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [state, setState] = useState<SwapAndDepositState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const gatewayAddress = CONTRACTS.GATEWAY

  // Get quote for exact input (specify input amount, get output amount)
  const getQuoteExactInput = useCallback(
    async (inputToken: InputToken, amountIn: bigint): Promise<SwapQuote | null> => {
      if (!publicClient || !address || amountIn <= 0n || !gatewayAddress) {
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
              fee: POOL_FEE,
              sqrtPriceLimitX96: 0n,
            },
          ],
        })

        const amountOut = result.result[0]

        // Check if approval is needed for non-native tokens (approve Gateway, not SwapRouter)
        let needsApproval = false
        if (!tokenConfig.isNative) {
          const allowance = await publicClient.readContract({
            address: tokenConfig.address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, gatewayAddress],
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
    [publicClient, address, gatewayAddress]
  )

  // Get quote for exact output (specify output amount, get input amount)
  const getQuoteExactOutput = useCallback(
    async (inputToken: InputToken, amountOut: bigint): Promise<SwapQuote | null> => {
      if (!publicClient || !address || amountOut <= 0n || !gatewayAddress) {
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
              fee: POOL_FEE,
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
            args: [address, gatewayAddress],
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
    [publicClient, address, gatewayAddress]
  )

  // Approve token for gateway
  const approveToken = useCallback(
    async (inputToken: InputToken): Promise<boolean> => {
      if (!walletClient || !publicClient || !gatewayAddress) {
        setError('Wallet not connected or gateway not configured')
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
          args: [gatewayAddress, maxUint256],
        })

        // In local mode, skip waiting for receipt (can cause issues with Anvil fork)
        if (!IS_LOCAL) {
          await publicClient.waitForTransactionReceipt({ hash })
        }

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
    [walletClient, publicClient, gatewayAddress, quote]
  )

  // Execute exact input swap and deposit
  const executeSwapAndDepositExactInput = useCallback(
    async (
      inputToken: InputToken,
      amountIn: bigint,
      minAmountOut: bigint,
      commitment: bigint
    ): Promise<boolean> => {
      if (!walletClient || !publicClient || !gatewayAddress) {
        setError('Wallet not connected or gateway not configured')
        return false
      }

      const tokenConfig = INPUT_TOKENS[inputToken]
      setState('depositing')
      setError(null)

      try {
        // Convert commitment to bytes32
        const commitmentBytes = pad(toHex(commitment), { size: 32 }) as `0x${string}`

        let hash: `0x${string}`

        if (tokenConfig.isNative) {
          // ETH: depositWithETH(commitment, minAmountOut)
          hash = await walletClient.writeContract({
            address: gatewayAddress,
            abi: ANON_POOL_GATEWAY_ABI,
            functionName: 'depositWithETH',
            args: [commitmentBytes, minAmountOut],
            value: amountIn,
          })
        } else {
          // USDC: depositWithUSDC(commitment, amountIn, minAmountOut)
          hash = await walletClient.writeContract({
            address: gatewayAddress,
            abi: ANON_POOL_GATEWAY_ABI,
            functionName: 'depositWithUSDC',
            args: [commitmentBytes, amountIn, minAmountOut],
          })
        }

        setTxHash(hash)
        // In local mode, skip waiting for receipt (can cause issues with Anvil fork)
        if (!IS_LOCAL) {
          await publicClient.waitForTransactionReceipt({ hash })
        }
        setState('success')
        return true
      } catch (err) {
        console.error('Swap and deposit error:', err)
        handleError(err)
        return false
      }
    },
    [walletClient, publicClient, gatewayAddress]
  )

  // Execute exact output swap and deposit
  const executeSwapAndDepositExactOutput = useCallback(
    async (
      inputToken: InputToken,
      amountOut: bigint,
      maxAmountIn: bigint,
      commitment: bigint
    ): Promise<boolean> => {
      if (!walletClient || !publicClient || !gatewayAddress) {
        setError('Wallet not connected or gateway not configured')
        return false
      }

      const tokenConfig = INPUT_TOKENS[inputToken]
      setState('depositing')
      setError(null)

      try {
        // Convert commitment to bytes32
        const commitmentBytes = pad(toHex(commitment), { size: 32 }) as `0x${string}`

        let hash: `0x${string}`

        if (tokenConfig.isNative) {
          // ETH: depositExactWithETH(commitment, amountOut) - send maxAmountIn as value
          hash = await walletClient.writeContract({
            address: gatewayAddress,
            abi: ANON_POOL_GATEWAY_ABI,
            functionName: 'depositExactWithETH',
            args: [commitmentBytes, amountOut],
            value: maxAmountIn, // Send max ETH, excess is refunded
          })
        } else {
          // USDC: depositExactWithUSDC(commitment, amountOut, maxAmountIn)
          hash = await walletClient.writeContract({
            address: gatewayAddress,
            abi: ANON_POOL_GATEWAY_ABI,
            functionName: 'depositExactWithUSDC',
            args: [commitmentBytes, amountOut, maxAmountIn],
          })
        }

        setTxHash(hash)
        // In local mode, skip waiting for receipt (can cause issues with Anvil fork)
        if (!IS_LOCAL) {
          await publicClient.waitForTransactionReceipt({ hash })
        }
        setState('success')
        return true
      } catch (err) {
        console.error('Swap and deposit error:', err)
        handleError(err)
        return false
      }
    },
    [walletClient, publicClient, gatewayAddress]
  )

  // Common error handler
  const handleError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Transaction failed'
    if (message.includes('user rejected')) {
      setError('Transaction rejected')
    } else if (message.includes('insufficient funds')) {
      setError('Insufficient balance')
    } else if (message.includes('Too little received') || message.includes('Too much requested')) {
      setError('Price moved too much. Try again.')
    } else if (message.includes('SlippageProtectionRequired')) {
      setError('Slippage protection required')
    } else {
      setError(message.length > 100 ? 'Transaction failed. Try again.' : message)
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
    gatewayAddress,
    getQuoteExactInput,
    getQuoteExactOutput,
    approveToken,
    executeSwapAndDepositExactInput,
    executeSwapAndDepositExactOutput,
    reset,
    formatTokenAmount,
  }
}
