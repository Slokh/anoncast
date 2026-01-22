'use client'

import { useState, useCallback, useEffect } from 'react'
import { parseUnits, formatUnits } from 'viem'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Shield,
  Wallet,
} from 'lucide-react'
import { useDeposit } from '@/hooks/use-deposit'
import { TOKEN_DECIMALS } from '@/config/chains'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  generateDeposit: (amount: bigint) => { commitment: bigint; note: any } | null
  sync: () => Promise<void>
}

export function DepositModal({
  open,
  onOpenChange,
  onSuccess,
  generateDeposit,
  sync,
}: Props) {
  const [amount, setAmount] = useState('')

  const {
    state,
    error,
    result,
    tokenBalance,
    deposit,
    reset,
    formatTokenAmount,
  } = useDeposit()

  // Default to max balance when modal opens
  useEffect(() => {
    if (open && tokenBalance && !amount) {
      setAmount(formatUnits(tokenBalance, TOKEN_DECIMALS))
    }
  }, [open, tokenBalance, amount])

  const amountBigInt = amount ? parseUnits(amount, TOKEN_DECIMALS) : 0n
  const hasEnoughBalance = tokenBalance ? amountBigInt <= tokenBalance : false
  const canDeposit = amountBigInt > 0n && hasEnoughBalance && (state === 'idle' || state === 'error')

  const handleDeposit = useCallback(async () => {
    if (amountBigInt <= 0n || !hasEnoughBalance) return

    // Reset error state if retrying
    if (state === 'error') {
      reset()
    }

    const result = await deposit(amountBigInt, () => {
      const depositData = generateDeposit(amountBigInt)
      if (!depositData) {
        throw new Error('Failed to generate deposit commitment')
      }
      return {
        commitment: depositData.commitment,
        note: depositData.note,
        index: depositData.note.index,
      }
    })

    if (result) {
      // Sync to pick up the new note from chain
      await sync()
      onSuccess?.()
    }
  }, [amountBigInt, hasEnoughBalance, state, reset, deposit, generateDeposit, sync, onSuccess])

  const handleClose = useCallback(() => {
    if (state !== 'idle' && state !== 'success' && state !== 'error') {
      // Don't allow closing during transaction
      return
    }
    reset()
    setAmount('')
    onOpenChange(false)
  }, [state, reset, onOpenChange])

  const handleMaxClick = useCallback(() => {
    if (tokenBalance) {
      setAmount(formatUnits(tokenBalance, TOKEN_DECIMALS))
    }
  }, [tokenBalance])

  const isProcessing =
    state !== 'idle' && state !== 'success' && state !== 'error'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={!isProcessing}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-500" />
            Deposit to Privacy Pool
          </DialogTitle>
          <DialogDescription>
            Your tokens will be converted to private notes that only you can spend.
          </DialogDescription>
        </DialogHeader>

        {state === 'success' ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">Deposit Successful!</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-primary">
                {result && formatTokenAmount(result.amount)} <span className="text-sm font-normal">$ANON</span>
              </p>
            </div>
            <button
              onClick={handleClose}
              className="mt-2 cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-primary/40"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Amount Input */}
            <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-4">
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  disabled={isProcessing}
                  className="w-full bg-transparent font-mono text-3xl font-bold tabular-nums placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="ml-2 text-sm font-medium text-primary">$ANON</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-primary/20 pt-3">
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3 w-3 text-yellow-500" />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Balance: {tokenBalance ? formatTokenAmount(tokenBalance) : '0'}
                  </span>
                </div>
                <button
                  onClick={handleMaxClick}
                  disabled={isProcessing}
                  className="cursor-pointer rounded-md bg-primary/20 px-2 py-1 text-xs font-medium uppercase tracking-wider text-primary transition-all hover:scale-105 hover:bg-primary/30 active:scale-95 disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
              {amount && !hasEnoughBalance && (
                <p className="mt-2 text-xs text-destructive">Insufficient balance</p>
              )}
            </div>

            {/* Info box */}
            {!isProcessing && state !== 'error' && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">How it works</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>Tokens deposited into the privacy pool</li>
                  <li>A private note created only you can spend</li>
                  <li>Use notes to bid anonymously</li>
                </ul>
              </div>
            )}

            {/* Error message */}
            {state === 'error' && error && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Deposit Failed</p>
                </div>
                <p className="break-all text-xs text-destructive/80">{error}</p>
              </div>
            )}

            {/* Action button */}
            <button
              onClick={handleDeposit}
              disabled={!canDeposit || isProcessing}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting...
                </>
              ) : state === 'error' ? (
                'Try Again'
              ) : (
                `Deposit ${amount || '0'} $ANON`
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
