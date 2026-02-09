'use client'

import { useState, useEffect } from 'react'
import { formatUnits } from 'viem'
import { Loader2, Merge, CheckCircle, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { usePrivacyWallet, type Note } from '@/providers/privacy-wallet'
import { useConsolidate } from '@/hooks/use-consolidate'
import { TOKEN_DECIMALS } from '@/config/chains'
import { useTokenPrice } from '@/hooks/use-token-price'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ConsolidateModal({ open, onOpenChange, onSuccess }: Props) {
  const {
    notes,
    prepareConsolidation,
    markNotesSpent,
    sync,
    canConsolidate,
  } = usePrivacyWallet()

  const { state, error, progress, consolidate, reset, result } = useConsolidate()
  const { formatUsd } = useTokenPrice()

  const [selectedNotes, setSelectedNotes] = useState<Note[]>([])

  // Reset selection when modal opens
  useEffect(() => {
    if (open) {
      // Default: select all notes
      setSelectedNotes([...notes])
      reset()
    }
  }, [open, notes, reset])

  const toggleNote = (note: Note) => {
    const isSelected = selectedNotes.some(n => n.commitment === note.commitment)
    if (isSelected) {
      setSelectedNotes(selectedNotes.filter(n => n.commitment !== note.commitment))
    } else {
      setSelectedNotes([...selectedNotes, note])
    }
  }

  const selectAll = () => {
    setSelectedNotes([...notes])
  }

  const selectNone = () => {
    setSelectedNotes([])
  }

  const handleConsolidate = async () => {
    if (selectedNotes.length < 2) return

    const result = await consolidate(
      prepareConsolidation,
      selectedNotes,
      markNotesSpent
    )

    if (result) {
      // Sync wallet to pick up the new consolidated note
      await sync()
      onSuccess?.()
    }
  }

  const handleClose = () => {
    if (state !== 'generating_proofs' && state !== 'consolidating' && state !== 'waiting_consolidate') {
      reset()
      onOpenChange(false)
    }
  }

  const totalSelected = selectedNotes.reduce((sum, note) => sum + note.amount, 0n)
  const isProcessing = state === 'preparing' || state === 'generating_proofs' || state === 'consolidating' || state === 'waiting_consolidate'

  const formatAmount = (amount: bigint) => {
    const num = Number(formatUnits(amount, TOKEN_DECIMALS))
    return Math.floor(num).toLocaleString()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Consolidate Notes
          </DialogTitle>
          <DialogDescription>
            Merge multiple notes into a single note. This allows you to use your full balance for larger bids.
          </DialogDescription>
        </DialogHeader>

        {state === 'success' && result ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <p className="mt-3 font-semibold">Consolidation Complete!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.notesConsolidated} notes merged into 1
            </p>
            <p className="text-sm text-muted-foreground">
              Total: {formatAmount(result.totalAmount)} ANON
            </p>
            <button
              onClick={handleClose}
              className="mt-4 cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:scale-105"
            >
              Done
            </button>
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <p className="mt-3 font-semibold">Consolidation Failed</p>
            <p className="mt-1 text-center text-sm text-red-400">{error}</p>
            <button
              onClick={reset}
              className="mt-4 cursor-pointer rounded-xl border border-border px-6 py-2.5 text-sm font-semibold transition-all hover:bg-muted"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Note selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Select notes to consolidate</span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    disabled={isProcessing}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    Select All
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    onClick={selectNone}
                    disabled={isProcessing}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    Select None
                  </button>
                </div>
              </div>

              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border/50 p-2">
                {notes.map((note, index) => {
                  const isSelected = selectedNotes.some(n => n.commitment === note.commitment)
                  return (
                    <button
                      key={note.commitment.toString()}
                      onClick={() => toggleNote(note)}
                      disabled={isProcessing}
                      className={`w-full cursor-pointer rounded-md border p-2 text-left transition-all ${
                        isSelected
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-transparent bg-muted/30 hover:bg-muted/50'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Note #{index + 1}
                        </span>
                        <span className="text-sm">
                          {formatAmount(note.amount)} ANON
                        </span>
                      </div>
                      {formatUsd(note.amount) && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          ≈ {formatUsd(note.amount)}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Notes selected</span>
                <span className="font-medium">{selectedNotes.length} of {notes.length}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total amount</span>
                <span className="font-medium">{formatAmount(totalSelected)} ANON</span>
              </div>
            </div>

            {/* Progress indicator */}
            {isProcessing && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">
                    {state === 'preparing' && 'Preparing consolidation...'}
                    {state === 'generating_proofs' && `Generating proof ${progress.current} of ${progress.total}...`}
                    {state === 'consolidating' && 'Submitting transaction...'}
                    {state === 'waiting_consolidate' && 'Waiting for confirmation...'}
                  </span>
                </div>
                {state === 'generating_proofs' && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Action button */}
            <button
              onClick={handleConsolidate}
              disabled={selectedNotes.length < 2 || isProcessing}
              className="w-full cursor-pointer rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </span>
              ) : selectedNotes.length < 2 ? (
                'Select at least 2 notes'
              ) : (
                `Consolidate ${selectedNotes.length} Notes`
              )}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              This will generate {selectedNotes.length} proofs and may take a few minutes.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
