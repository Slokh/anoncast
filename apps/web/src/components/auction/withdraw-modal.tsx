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
            <Eye className="h-5 w-5" />
            Withdraw from Privacy Pool
          </DialogTitle>
          <DialogDescription>
            Withdraw $ANON tokens from the privacy pool back to your public wallet.
          </DialogDescription>
        </DialogHeader>

        {state === 'success' ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <div className="text-center">
              <p className="text-lg font-semibold">Withdrawal Successful!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result && formatTokenAmount(result.amount)} $ANON withdrawn
              </p>
            </div>
            <Button onClick={handleClose} className="mt-4 cursor-pointer">
              Close
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Private Balance Display */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Private Balance</span>
                </div>
                <span className="text-lg font-semibold">
                  {formatBalance(privateBalance)} $ANON
                </span>
              </div>
            </div>

            {/* Note Selection */}
            {availableNotes.length > 0 ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select note to withdraw</label>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {availableNotes.map((note, index) => (
                    <button
                      key={note.commitment.toString()}
                      onClick={() => setSelectedNoteIndex(index)}
                      disabled={isProcessing}
                      className={`w-full cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                        selectedNoteIndex === index
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-muted/30 hover:bg-muted/50'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Note #{index + 1}
                        </span>
                        <span className="font-mono font-semibold">
                          {formatUnits(note.amount, TOKEN_DECIMALS)} $ANON
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                No notes available to withdraw
              </div>
            )}

            {/* Info box */}
            {!isProcessing && state !== 'error' && selectedNote && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Withdrawing:</p>
                <p className="mt-1">
                  {formatUnits(selectedNote.amount, TOKEN_DECIMALS)} $ANON will be sent to your public wallet.
                </p>
              </div>
            )}

            {/* Coming soon notice */}
            {!isProcessing && state !== 'error' && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600">
                <p className="font-medium">Coming Soon</p>
                <p className="mt-1 text-xs">
                  Withdrawal ZK proof generation is being implemented. This feature will be available soon.
                </p>
              </div>
            )}

            {/* Error message */}
            {state === 'error' && error && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
                  <p className="text-sm font-medium text-destructive">Withdrawal Failed</p>
                </div>
                <p className="break-all text-xs text-destructive/80">{error}</p>
              </div>
            )}

            {/* Action button */}
            <Button
              onClick={handleWithdraw}
              disabled={!canWithdraw || isProcessing}
              className="w-full cursor-pointer"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {state === 'preparing' && 'Preparing...'}
                  {state === 'generating_proof' && 'Generating proof...'}
                  {state === 'withdrawing' && 'Submitting...'}
                  {state === 'waiting_withdraw' && 'Waiting...'}
                </>
              ) : state === 'error' ? (
                'Try Again'
              ) : selectedNote ? (
                `Withdraw ${formatUnits(selectedNote.amount, TOKEN_DECIMALS)} $ANON`
              ) : (
                'Select a note'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
