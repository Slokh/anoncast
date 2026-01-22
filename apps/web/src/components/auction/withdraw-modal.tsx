'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { formatUnits } from 'viem'
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
  Eye,
  Shield,
} from 'lucide-react'
import { useWithdraw } from '@/hooks/use-withdraw'
import { TOKEN_DECIMALS } from '@/config/chains'

type Note = {
  secret: bigint
  nullifier: bigint
  commitment: bigint
  amount: bigint
  leafIndex: number
  timestamp: number
}

type WithdrawPreparation = {
  inputNote: Note
  merkleProof: { path: bigint[]; indices: number[]; root: bigint }
  nullifierHash: bigint
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  privateBalance: bigint
  notes: Note[]
  prepareWithdraw: (amount: bigint) => Promise<WithdrawPreparation | null>
  markNoteSpent: (commitment: bigint, txHash: string) => Promise<void>
  sync: () => Promise<void>
  formatBalance: (amount: bigint) => string
}

export function WithdrawModal({
  open,
  onOpenChange,
  onSuccess,
  privateBalance,
  notes,
  prepareWithdraw,
  markNoteSpent,
  sync,
  formatBalance,
}: Props) {
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null)

  const {
    state,
    error,
    result,
    withdraw,
    reset,
    formatTokenAmount,
  } = useWithdraw()

  // Get available notes sorted by amount (largest first)
  const availableNotes = useMemo(() => {
    return [...notes].sort((a, b) => Number(b.amount - a.amount))
  }, [notes])

  // Auto-select the largest note when modal opens
  useEffect(() => {
    if (open && availableNotes.length > 0 && selectedNoteIndex === null) {
      setSelectedNoteIndex(0)
    }
  }, [open, availableNotes, selectedNoteIndex])

  const selectedNote = selectedNoteIndex !== null ? availableNotes[selectedNoteIndex] : null
  const canWithdraw = selectedNote && (state === 'idle' || state === 'error')

  const handleWithdraw = useCallback(async () => {
    if (!selectedNote) return

    // Reset error state if retrying
    if (state === 'error') {
      reset()
    }

    const result = await withdraw(
      selectedNote.amount,
      prepareWithdraw,
      markNoteSpent
    )

    if (result) {
      // Sync to update balances
      await sync()
      onSuccess?.()
    }
  }, [selectedNote, state, reset, withdraw, prepareWithdraw, markNoteSpent, sync, onSuccess])

  const handleClose = useCallback(() => {
    if (state !== 'idle' && state !== 'success' && state !== 'error') {
      // Don't allow closing during transaction
      return
    }
    reset()
    setSelectedNoteIndex(null)
    onOpenChange(false)
  }, [state, reset, onOpenChange])

  const isProcessing =
    state !== 'idle' && state !== 'success' && state !== 'error'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={!isProcessing}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-yellow-500" />
            Withdraw from Privacy Pool
          </DialogTitle>
          <DialogDescription>
            Withdraw tokens back to your public wallet.
          </DialogDescription>
        </DialogHeader>

        {state === 'success' ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">Withdrawal Successful!</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-primary">
                {result && formatTokenAmount(result.amount)} <span className="text-sm font-normal">ANON</span>
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
            {/* Private Balance Display */}
            <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-green-500" />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Private Balance</span>
                </div>
                <span className="font-mono text-xl font-bold tabular-nums text-primary">
                  {formatBalance(privateBalance)} <span className="text-sm font-normal">ANON</span>
                </span>
              </div>
            </div>

            {/* Note Selection */}
            {availableNotes.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select note to withdraw</label>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {availableNotes.map((note, index) => (
                    <button
                      key={note.commitment.toString()}
                      onClick={() => setSelectedNoteIndex(index)}
                      disabled={isProcessing}
                      className={`w-full cursor-pointer rounded-lg border p-3 text-left transition-all hover:scale-[1.01] active:scale-[0.99] ${
                        selectedNoteIndex === index
                          ? 'border-primary/30 bg-primary/10 ring-1 ring-primary/30'
                          : 'border-border/50 bg-muted/30 hover:bg-muted/50'
                      } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">
                          Note #{index + 1}
                        </span>
                        <span className="font-mono text-sm font-bold tabular-nums">
                          {formatUnits(note.amount, TOKEN_DECIMALS)} <span className="text-xs font-normal text-primary">ANON</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                No notes available to withdraw
              </div>
            )}

            {/* Info box */}
            {!isProcessing && state !== 'error' && selectedNote && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Withdrawing</p>
                <p className="mt-1">
                  {formatUnits(selectedNote.amount, TOKEN_DECIMALS)} ANON will be sent to your public wallet.
                </p>
              </div>
            )}


            {/* Error message */}
            {state === 'error' && error && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Withdrawal Failed</p>
                </div>
                <p className="break-all text-xs text-destructive/80">{error}</p>
              </div>
            )}

            {/* Action button */}
            <button
              onClick={handleWithdraw}
              disabled={!canWithdraw || isProcessing}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {state === 'preparing' && 'Preparing...'}
                  {state === 'generating_proof' && 'Generating proof...'}
                  {state === 'withdrawing' && 'Submitting...'}
                  {state === 'waiting_withdraw' && 'Waiting...'}
                </>
              ) : state === 'error' ? (
                'Try Again'
              ) : selectedNote ? (
                `Withdraw ${formatUnits(selectedNote.amount, TOKEN_DECIMALS)} ANON`
              ) : (
                'Select a note'
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
