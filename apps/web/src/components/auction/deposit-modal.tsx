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
            <Shield className="h-5 w-5" />
            Deposit to Privacy Pool
          </DialogTitle>
          <DialogDescription>
            Deposit $ANON tokens into the privacy pool. Your tokens will be
            converted to private notes that only you can spend.
          </DialogDescription>
        </DialogHeader>

        {state === 'success' ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <div className="text-center">
              <p className="text-lg font-semibold">Deposit Successful!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result && formatTokenAmount(result.amount)} $ANON deposited
              </p>
            </div>
            <Button onClick={handleClose} className="mt-4 cursor-pointer">
              Close
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Amount Input */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  disabled={isProcessing}
                  className="w-full bg-transparent text-3xl font-semibold tabular-nums placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
                />
                <span className="ml-2 text-xl font-medium text-muted-foreground">$ANON</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  <span>Balance: {tokenBalance ? formatTokenAmount(tokenBalance) : '0'}</span>
                </div>
                <button
                  onClick={handleMaxClick}
                  disabled={isProcessing}
                  className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
              {amount && !hasEnoughBalance && (
                <p className="mt-2 text-sm text-destructive">Insufficient balance</p>
              )}
            </div>

            {/* Info box */}
            {!isProcessing && state !== 'error' && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How it works:</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>Your tokens are deposited into the privacy pool</li>
                  <li>
                    A private note is created that only you can spend
                  </li>
                  <li>Use notes to bid anonymously in auctions</li>
                </ul>
              </div>
            )}

            {/* Error message */}
            {state === 'error' && error && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
                  <p className="text-sm font-medium text-destructive">Deposit Failed</p>
                </div>
                <p className="break-all text-xs text-destructive/80">{error}</p>
              </div>
            )}

            {/* Action button */}
            <Button
              onClick={handleDeposit}
              disabled={!canDeposit || isProcessing}
              className="w-full cursor-pointer"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Waiting...
                </>
              ) : state === 'error' ? (
                'Try Again'
              ) : (
                `Deposit ${amount || '0'} $ANON`
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
