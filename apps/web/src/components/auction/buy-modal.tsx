'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { parseEther, parseUnits, formatEther, formatUnits } from 'viem'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CheckCircle, AlertCircle, Loader2, ArrowDown, ChevronDown, Settings2 } from 'lucide-react'
import { useSwap, type InputToken, type SwapMode } from '@/hooks/use-swap'
import { useTokenPrice } from '@/hooks/use-token-price'
import { useDeposit } from '@/hooks/use-deposit'
import { ERC20_ABI } from '@/config/contracts'
import { TOKEN_DECIMALS } from '@/config/chains'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

// Slippage options (in basis points: 50 = 0.5%, 100 = 1%)
const SLIPPAGE_OPTIONS = [
  { label: 'Auto', value: 'auto' as const, bps: 50 }, // 0.5% for auto
  { label: '0.5%', value: '0.5' as const, bps: 50 },
  { label: '1%', value: '1' as const, bps: 100 },
]

type SlippageOption = 'auto' | '0.5' | '1' | 'custom'

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// Token icons
const TOKEN_ICONS: Record<InputToken, string> = {
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  USDC: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
}

export function BuyModal({ open, onOpenChange, onSuccess }: Props) {
  const { address } = useAccount()
  const { data: ethBalance } = useBalance({ address })
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  }) as { data: bigint | undefined }
  const { refetchBalance } = useDeposit()
  const { formatUsd } = useTokenPrice()

  const {
    state,
    error,
    quote,
    getQuoteExactInput,
    getQuoteExactOutput,
    approveToken,
    executeSwapExactInput,
    executeSwapExactOutput,
    reset,
    formatTokenAmount,
  } = useSwap()

  const [inputToken, setInputToken] = useState<InputToken>('ETH')
  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  const [swapMode, setSwapMode] = useState<SwapMode>('exactInput')
  const [showTokenSelect, setShowTokenSelect] = useState(false)
  const [showSlippageSettings, setShowSlippageSettings] = useState(false)
  const [slippageOption, setSlippageOption] = useState<SlippageOption>('auto')
  const [customSlippage, setCustomSlippage] = useState('')

  // Track which field is being edited to avoid circular updates
  const editingFieldRef = useRef<'input' | 'output' | null>(null)

  // Calculate effective slippage in basis points
  const slippageBps = slippageOption === 'custom'
    ? Math.round(parseFloat(customSlippage || '0.5') * 100)
    : SLIPPAGE_OPTIONS.find(o => o.value === slippageOption)?.bps ?? 50

  const slippagePercent = slippageBps / 100

  // Get balance for selected token
  const balance = inputToken === 'ETH' ? ethBalance?.value : usdcBalance
  const formattedBalance = balance
    ? inputToken === 'ETH'
      ? formatEther(balance)
      : formatUnits(balance, 6)
    : '0'

  // Parse amounts based on token decimals
  const inputAmountWei = inputAmount
    ? inputToken === 'ETH'
      ? parseEther(inputAmount)
      : parseUnits(inputAmount, 6)
    : 0n

  // Debounce quote fetching for input amount changes (exactInput mode)
  useEffect(() => {
    if (editingFieldRef.current !== 'input') return
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      return
    }

    const timer = setTimeout(async () => {
      try {
        const parsedAmount =
          inputToken === 'ETH' ? parseEther(inputAmount) : parseUnits(inputAmount, 6)
        const newQuote = await getQuoteExactInput(inputToken, parsedAmount)
        if (newQuote) {
          setSwapMode('exactInput')
          // Update output display from quote
          const formatted = formatUnits(newQuote.amountOut, TOKEN_DECIMALS)
          setOutputAmount(parseFloat(formatted).toFixed(2))
        }
      } catch {
        // Invalid input
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [inputAmount, inputToken, getQuoteExactInput])

  // Debounce quote fetching for output amount changes (exactOutput mode)
  useEffect(() => {
    if (editingFieldRef.current !== 'output') return
    if (!outputAmount || parseFloat(outputAmount) <= 0) {
      return
    }

    const timer = setTimeout(async () => {
      try {
        const parsedAmount = parseUnits(outputAmount, TOKEN_DECIMALS)
        const newQuote = await getQuoteExactOutput(inputToken, parsedAmount)
        if (newQuote) {
          setSwapMode('exactOutput')
          // Update input display from quote
          const formatted = inputToken === 'ETH'
            ? formatEther(newQuote.amountIn)
            : formatUnits(newQuote.amountIn, 6)
          const decimals = inputToken === 'ETH' ? 6 : 2
          setInputAmount(parseFloat(formatted).toFixed(decimals))
        }
      } catch {
        // Invalid input
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [outputAmount, inputToken, getQuoteExactOutput])

  // Reset amounts when switching tokens
  useEffect(() => {
    setInputAmount('')
    setOutputAmount('')
    editingFieldRef.current = null
  }, [inputToken])

  const hasEnoughBalance = balance ? inputAmountWei <= balance : false
  const needsApproval = quote?.needsApproval ?? false
  const isApproving = state === 'approving'
  const canSwap =
    inputAmountWei > 0n &&
    hasEnoughBalance &&
    quote &&
    quote.amountOut > 0n &&
    !needsApproval &&
    (state === 'idle' || state === 'error')
  const canApprove =
    needsApproval && (state === 'idle' || state === 'error')

  const handleApprove = useCallback(async () => {
    await approveToken(inputToken)
  }, [approveToken, inputToken])

  const handleSwap = useCallback(async () => {
    if (!quote || !canSwap) return

    let success = false

    if (swapMode === 'exactInput') {
      // For exact input, apply slippage to output (minimum received)
      const minAmountOut = (quote.amountOut * BigInt(10000 - slippageBps)) / 10000n
      success = await executeSwapExactInput(inputToken, quote.amountIn, minAmountOut)
    } else {
      // For exact output, apply slippage to input (maximum spent)
      const maxAmountIn = (quote.amountIn * BigInt(10000 + slippageBps)) / 10000n
      success = await executeSwapExactOutput(inputToken, quote.amountOut, maxAmountIn)
    }

    if (success) {
      await refetchBalance()
      onSuccess?.()
    }
  }, [quote, canSwap, swapMode, executeSwapExactInput, executeSwapExactOutput, inputToken, slippageBps, refetchBalance, onSuccess])

  const handleClose = useCallback(() => {
    if (state === 'swapping' || state === 'approving') {
      return
    }
    reset()
    setInputAmount('')
    setOutputAmount('')
    setInputToken('ETH')
    editingFieldRef.current = null
    onOpenChange(false)
  }, [state, reset, onOpenChange])

  const handleMaxClick = useCallback(() => {
    if (!balance) return

    editingFieldRef.current = 'input'
    if (inputToken === 'ETH') {
      // Leave some ETH for gas (0.001 ETH)
      const maxAmount = balance - parseEther('0.001')
      if (maxAmount > 0n) {
        setInputAmount(formatEther(maxAmount))
      }
    } else {
      setInputAmount(formatUnits(balance, 6))
    }
  }, [balance, inputToken])

  const handleInputChange = useCallback((value: string) => {
    editingFieldRef.current = 'input'
    setInputAmount(value)
    if (!value || parseFloat(value) <= 0) {
      setOutputAmount('')
    }
  }, [])

  const handleOutputChange = useCallback((value: string) => {
    editingFieldRef.current = 'output'
    setOutputAmount(value)
    if (!value || parseFloat(value) <= 0) {
      setInputAmount('')
    }
  }, [])

  const handleTokenSelect = useCallback((token: InputToken) => {
    setInputToken(token)
    setShowTokenSelect(false)
  }, [])

  const isProcessing = state === 'swapping' || state === 'approving'
  const isQuoting = state === 'quoting'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={!isProcessing}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img src="/anon.png" alt="ANON" className="h-5 w-5 rounded-full" />
            Buy ANON
          </DialogTitle>
          <DialogDescription>Swap ETH or USDC for ANON tokens using Uniswap.</DialogDescription>
        </DialogHeader>

        {state === 'success' ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">Swap Successful!</p>
              {quote && (
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-primary">
                  +{formatTokenAmount(quote.amountOut)} ANON
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="mt-2 cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-primary/40"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Input Token */}
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>You pay</span>
                <span>
                  Balance: {parseFloat(formattedBalance).toFixed(inputToken === 'ETH' ? 4 : 2)}{' '}
                  {inputToken}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  value={inputAmount}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="0"
                  disabled={isProcessing}
                  className="min-w-0 flex-1 bg-transparent font-mono text-2xl font-bold tabular-nums placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  onClick={handleMaxClick}
                  disabled={isProcessing}
                  className="cursor-pointer rounded-md bg-primary/20 px-2 py-1 text-xs font-medium uppercase tracking-wider text-primary transition-all hover:bg-primary/30 disabled:opacity-50"
                >
                  MAX
                </button>

                {/* Token selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowTokenSelect(!showTokenSelect)}
                    disabled={isProcessing}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 transition-colors hover:bg-muted/80 disabled:opacity-50"
                  >
                    <img
                      src={TOKEN_ICONS[inputToken]}
                      alt={inputToken}
                      className="h-5 w-5 rounded-full"
                    />
                    <span className="text-sm font-medium">{inputToken}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>

                  {/* Dropdown */}
                  {showTokenSelect && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-32 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
                      <button
                        onClick={() => handleTokenSelect('ETH')}
                        className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${inputToken === 'ETH' ? 'bg-muted' : ''}`}
                      >
                        <img
                          src={TOKEN_ICONS.ETH}
                          alt="ETH"
                          className="h-5 w-5 rounded-full"
                        />
                        ETH
                      </button>
                      <button
                        onClick={() => handleTokenSelect('USDC')}
                        className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${inputToken === 'USDC' ? 'bg-muted' : ''}`}
                      >
                        <img
                          src={TOKEN_ICONS.USDC}
                          alt="USDC"
                          className="h-5 w-5 rounded-full"
                        />
                        USDC
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="rounded-lg border border-border/50 bg-background p-2">
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* ANON Output */}
            <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>You receive</span>
                {isQuoting && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Getting quote...
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  value={outputAmount}
                  onChange={(e) => handleOutputChange(e.target.value)}
                  placeholder="0"
                  disabled={isProcessing}
                  className="min-w-0 flex-1 bg-transparent font-mono text-2xl font-bold tabular-nums text-primary placeholder:text-primary/30 focus:outline-none disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5">
                  <img src="/anon.png" alt="ANON" className="h-5 w-5 rounded-full" />
                  <span className="text-sm font-medium text-primary">ANON</span>
                </div>
              </div>
              {quote && formatUsd(quote.amountOut) && (
                <div className="mt-1 text-xs text-primary/60">{formatUsd(quote.amountOut)}</div>
              )}
            </div>

            {/* Swap details */}
            {quote && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Slippage tolerance</span>
                  <button
                    onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                    className="flex cursor-pointer items-center gap-1 text-primary hover:text-primary/80"
                  >
                    <span>{slippageOption === 'auto' ? 'Auto' : `${slippagePercent}%`}</span>
                    <Settings2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Slippage settings panel */}
                {showSlippageSettings && (
                  <div className="mt-2 rounded-lg border border-border/50 bg-background p-2">
                    <div className="flex items-center gap-1">
                      {SLIPPAGE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setSlippageOption(option.value)
                            setCustomSlippage('')
                          }}
                          className={`flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                            slippageOption === option.value
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted hover:bg-muted/80'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={customSlippage}
                          onChange={(e) => {
                            setCustomSlippage(e.target.value)
                            setSlippageOption('custom')
                          }}
                          placeholder="Custom"
                          className={`w-full rounded-md px-2 py-1.5 pr-6 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                            slippageOption === 'custom'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                    {slippageOption === 'custom' && parseFloat(customSlippage) > 5 && (
                      <p className="mt-1.5 text-[10px] text-yellow-500">
                        High slippage increases risk of unfavorable trade
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-1.5 flex items-center justify-between text-muted-foreground">
                  {swapMode === 'exactInput' ? (
                    <>
                      <span>Minimum received</span>
                      <span>
                        {formatTokenAmount((quote.amountOut * BigInt(10000 - slippageBps)) / 10000n)}{' '}
                        ANON
                      </span>
                    </>
                  ) : (
                    <>
                      <span>Maximum spent</span>
                      <span>
                        {inputToken === 'ETH'
                          ? parseFloat(formatEther((quote.amountIn * BigInt(10000 + slippageBps)) / 10000n)).toFixed(6)
                          : parseFloat(formatUnits((quote.amountIn * BigInt(10000 + slippageBps)) / 10000n, 6)).toFixed(2)}{' '}
                        {inputToken}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Balance warning */}
            {inputAmount && !hasEnoughBalance && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-xs text-destructive">Insufficient {inputToken} balance</p>
              </div>
            )}

            {/* Error message */}
            {state === 'error' && error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              </div>
            )}

            {/* Action button */}
            {(needsApproval || isApproving) ? (
              <button
                onClick={handleApprove}
                disabled={isApproving || !canApprove}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
              >
                {isApproving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Approving...
                  </>
                ) : (
                  `Approve ${inputToken}`
                )}
              </button>
            ) : (
              <button
                onClick={handleSwap}
                disabled={!canSwap || isProcessing || isQuoting}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Swapping...
                  </>
                ) : isQuoting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Getting quote...
                  </>
                ) : (!inputAmount || parseFloat(inputAmount) <= 0) && (!outputAmount || parseFloat(outputAmount) <= 0) ? (
                  'Enter amount'
                ) : !hasEnoughBalance ? (
                  'Insufficient balance'
                ) : !quote ? (
                  'Unable to quote'
                ) : state === 'error' ? (
                  'Try Again'
                ) : (
                  `Swap for ${formatTokenAmount(quote.amountOut)} ANON`
                )}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
