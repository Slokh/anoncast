'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Loader2, Timer, CheckCircle, XCircle, Play, AlertCircle } from 'lucide-react'
import { generateProof, type ProofInput } from '@/lib/prover'
import { useProofMode, PROOF_MODE_INFO } from '@/hooks/use-proof-mode'
import type { Note } from '@anon/sdk/core'
import type { WithdrawPreparation } from '@anon/sdk/blockchain'

type BenchmarkRun = {
  iteration: number
  verifierLoadTime: number
  proofGenerationTime: number
  totalTime: number
  proofSize: number
  status: 'pending' | 'running' | 'complete' | 'error'
  error?: string
}

type BenchmarkState = 'idle' | 'running' | 'complete' | 'error'

const ITERATIONS = 3

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  notes: Note[]
  prepareWithdraw: (amount: bigint) => Promise<WithdrawPreparation | null>
}

export function BenchmarkModal({ open, onOpenChange, notes, prepareWithdraw }: Props) {
  const { address } = useAccount()
  const { mode: proofMode } = useProofMode()
  const [state, setState] = useState<BenchmarkState>('idle')
  const [runs, setRuns] = useState<BenchmarkRun[]>([])
  const [currentIteration, setCurrentIteration] = useState(0)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Get the largest available note for benchmarking
  const largestNote =
    notes.length > 0 ? [...notes].sort((a, b) => Number(b.amount - a.amount))[0] : null

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setState('idle')
      setRuns([])
      setCurrentIteration(0)
      setGlobalError(null)
    }
  }, [open])

  const runBenchmark = useCallback(async () => {
    if (!largestNote || !address) {
      setGlobalError('No notes available for benchmarking')
      setState('error')
      return
    }

    console.log(`[Benchmark] Starting ${proofMode} benchmark...`)
    console.log('[Benchmark] Using note with amount:', largestNote.amount.toString())

    setState('running')
    setGlobalError(null)

    // Initialize runs as pending
    const initialRuns: BenchmarkRun[] = []
    for (let i = 0; i < ITERATIONS; i++) {
      initialRuns.push({
        iteration: i + 1,
        verifierLoadTime: 0,
        proofGenerationTime: 0,
        totalTime: 0,
        proofSize: 0,
        status: 'pending',
      })
    }
    setRuns(initialRuns)

    await new Promise((resolve) => setTimeout(resolve, 100))

    try {
      // Prepare withdraw data
      console.log('[Benchmark] Preparing withdraw data...')
      const preparation = await prepareWithdraw(largestNote.amount)
      if (!preparation) {
        throw new Error('Failed to prepare withdraw data')
      }
      console.log('[Benchmark] Withdraw data prepared')

      const recipientBigInt = BigInt(address)
      const proofInput: ProofInput = {
        note: preparation.inputNote,
        merklePath: preparation.merkleProof.path,
        merkleIndices: preparation.merkleProof.indices,
        merkleRoot: preparation.merkleProof.root,
        recipient: recipientBigInt,
      }

      const updatedRuns = [...initialRuns]

      // Run iterations
      for (let i = 0; i < ITERATIONS; i++) {
        console.log(`[Benchmark] ${proofMode} iteration ${i + 1}...`)
        setCurrentIteration(i + 1)
        updatedRuns[i].status = 'running'
        setRuns([...updatedRuns])

        await new Promise((resolve) => setTimeout(resolve, 50))

        try {
          const totalStart = performance.now()

          // Cold start only on first iteration of 'main' mode
          const coldStart = proofMode === 'main' && i === 0
          const result = await generateProof(proofInput, proofMode, coldStart)

          const totalTime = performance.now() - totalStart

          updatedRuns[i] = {
            ...updatedRuns[i],
            verifierLoadTime: result.verifierLoadTime,
            proofGenerationTime: result.proofGenerationTime,
            totalTime,
            proofSize: result.proofSize,
            status: 'complete',
          }
          setRuns([...updatedRuns])

          console.log(
            `[Benchmark] ${proofMode} #${i + 1}: ${totalTime.toFixed(0)}ms (proof: ${result.proofGenerationTime.toFixed(0)}ms)`
          )
        } catch (err) {
          console.error(`[Benchmark] ${proofMode} #${i + 1} error:`, err)
          const errorMsg = err instanceof Error ? err.message : String(err)
          updatedRuns[i] = {
            ...updatedRuns[i],
            status: 'error',
            error: errorMsg,
          }
          setRuns([...updatedRuns])
        }
      }

      console.log('\n[Benchmark] Complete!')
      setState('complete')
    } catch (err) {
      console.error('[Benchmark] Fatal error:', err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      setGlobalError(`Fatal error: ${errorMsg}`)
      setState('error')
    }
  }, [largestNote, address, prepareWithdraw, proofMode])

  const handleClose = useCallback(() => {
    if (state === 'running') return
    onOpenChange(false)
  }, [state, onOpenChange])

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  // Calculate averages for completed runs
  const completedRuns = runs.filter((r) => r.status === 'complete')
  const averages =
    completedRuns.length > 0
      ? {
          verifierLoadTime:
            completedRuns.reduce((sum, r) => sum + r.verifierLoadTime, 0) / completedRuns.length,
          proofGenerationTime:
            completedRuns.reduce((sum, r) => sum + r.proofGenerationTime, 0) / completedRuns.length,
          totalTime: completedRuns.reduce((sum, r) => sum + r.totalTime, 0) / completedRuns.length,
        }
      : null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={state !== 'running'} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-yellow-500" />
            Withdraw Proof Benchmark
          </DialogTitle>
          <DialogDescription>
            {PROOF_MODE_INFO[proofMode].label} mode - {ITERATIONS} iterations
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* No notes warning */}
          {state === 'idle' && !largestNote && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>Deposit tokens to the privacy pool first to run the benchmark.</span>
            </div>
          )}

          {/* Run button */}
          {state === 'idle' && largestNote && (
            <button
              onClick={() => {
                console.log('[Benchmark] Button clicked')
                runBenchmark()
              }}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:shadow-primary/40"
            >
              <Play className="h-4 w-4" />
              Start Benchmark
            </button>
          )}

          {/* Progress indicator */}
          {state === 'running' && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>
                Iteration {currentIteration} of {ITERATIONS}...
              </span>
            </div>
          )}

          {/* Global error display */}
          {globalError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-semibold">Error</p>
              <p className="mt-1 break-all">{globalError}</p>
            </div>
          )}

          {/* Results table */}
          {runs.length > 0 && (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Run
                      </th>
                      <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {proofMode === 'server' ? 'Witness' : 'Verifier'}
                      </th>
                      <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Proof Gen
                      </th>
                      <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {runs.map((run) => (
                      <tr
                        key={run.iteration}
                        className={run.status === 'running' ? 'bg-primary/5' : ''}
                      >
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            {run.status === 'pending' && (
                              <div className="h-3 w-3 rounded-full border-2 border-muted-foreground/30" />
                            )}
                            {run.status === 'running' && (
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            )}
                            {run.status === 'complete' && (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                            {run.status === 'error' && (
                              <XCircle className="h-3 w-3 text-destructive" />
                            )}
                            <span className="font-mono text-xs">#{run.iteration}</span>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                          {run.status === 'complete' ? formatTime(run.verifierLoadTime) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                          {run.status === 'complete' ? formatTime(run.proofGenerationTime) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-bold">
                          {run.status === 'complete' ? formatTime(run.totalTime) : '—'}
                        </td>
                      </tr>
                    ))}
                    {/* Averages row */}
                    {averages && completedRuns.length > 1 && (
                      <tr className="bg-primary/10 font-semibold">
                        <td className="px-3 py-1.5">
                          <span className="text-xs text-primary">Avg</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-primary">
                          {formatTime(averages.verifierLoadTime)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-primary">
                          {formatTime(averages.proofGenerationTime)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-primary">
                          {formatTime(averages.totalTime)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary */}
          {state === 'complete' && averages && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
              <div className="text-xs text-muted-foreground">Average Proof Generation</div>
              <div className="font-mono text-2xl font-bold text-primary">
                {formatTime(averages.proofGenerationTime)}
              </div>
            </div>
          )}

          {/* Info box */}
          {state === 'complete' && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
              <p>
                <strong>{PROOF_MODE_INFO[proofMode].label}:</strong>{' '}
                {PROOF_MODE_INFO[proofMode].description}
              </p>
              <p className="mt-1">Change proof mode in the withdraw modal to compare.</p>
            </div>
          )}

          {/* Close button */}
          {(state === 'complete' || state === 'error') && (
            <button
              onClick={handleClose}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold transition-all hover:bg-white/20"
            >
              Close
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
