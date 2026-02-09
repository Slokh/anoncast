'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatUnits } from 'viem'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  ArrowDownToLine,
  Merge,
  Send,
  Check,
  Circle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { usePrivacyWallet } from '@/providers/privacy-wallet'
import { useDeposit } from '@/hooks/use-deposit'
import { usePostFlow, type PostFlowPlan, type PostFlowStep } from '@/hooks/use-post-flow'
import { useTokenPrice } from '@/hooks/use-token-price'
import { TOKEN_DECIMALS } from '@/config/chains'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  bidAmount: bigint
  content: {
    text: string
    image?: string
    embed?: string
  }
}

const STEP_LABELS: Record<PostFlowStep, { label: string; icon: React.ElementType; activeLabel: string }> = {
  analyzing: { label: 'Analyze', icon: Circle, activeLabel: 'Analyzing...' },
  buying: { label: 'Buy ANON', icon: ShoppingCart, activeLabel: 'Buying ANON...' },
  approving: { label: 'Approve', icon: Check, activeLabel: 'Approving...' },
  depositing: { label: 'Deposit', icon: ArrowDownToLine, activeLabel: 'Depositing...' },
  consolidating: { label: 'Merge Notes', icon: Merge, activeLabel: 'Merging notes...' },
  posting: { label: 'Post Bid', icon: Send, activeLabel: 'Posting bid...' },
  done: { label: 'Done', icon: CheckCircle, activeLabel: 'Complete!' },
}

export function PostModal({ open, onOpenChange, onSuccess, bidAmount, content }: Props) {
  const {
    notes,
    prepareTransfer,
    getClaimCredentials,
    prepareConsolidation,
    markNotesSpent,
    generateDeposit,
    sync,
    findNoteForTransfer,
  } = usePrivacyWallet()

  const { tokenBalance: publicBalance } = useDeposit()
  const { formatUsd } = useTokenPrice()

  const { state, plan, setPlan, analyzePlan, executeFlow, reset, formatAmount } = usePostFlow()

  const [showDetails, setShowDetails] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)

  // Analyze the plan when modal opens
  useEffect(() => {
    if (open && bidAmount > 0n) {
      const newPlan = analyzePlan(
        bidAmount,
        notes,
        publicBalance ?? 0n,
        findNoteForTransfer
      )
      setPlan(newPlan)
      setHasStarted(false)
      reset()
    }
  }, [open, bidAmount, notes, publicBalance, analyzePlan, findNoteForTransfer, setPlan, reset])

  const handleClose = () => {
    if (state.status !== 'running') {
      reset()
      onOpenChange(false)
    }
  }

  const handleStart = async () => {
    if (!plan) return

    setHasStarted(true)

    // Get the current slot ID
    const slotRes = await fetch('/api/auction/current')
    const slotData = await slotRes.json()
    const slotId = slotData.currentSlotId

    const result = await executeFlow(
      plan,
      {
        text: content.text,
        image: content.image,
        embed: content.embed,
        slotId,
      },
      {
        prepareTransfer,
        getClaimCredentials,
        prepareConsolidation,
        markNotesSpent,
        generateDeposit,
        sync,
        findNoteForTransfer,
        notes,
      }
    )

    if (result.success) {
      onSuccess?.()
    }
  }

  const formatAmountWithUsd = (amount: bigint) => {
    const formatted = formatAmount(amount)
    const usd = formatUsd(amount)
    return usd ? `${formatted} ANON (${usd})` : `${formatted} ANON`
  }

  // Determine step status
  const getStepStatus = (step: PostFlowStep, index: number): 'pending' | 'active' | 'complete' => {
    if (!plan || !hasStarted) return 'pending'

    const currentStepIndex = plan.steps.indexOf(state.currentStep || 'analyzing')

    if (index < currentStepIndex || state.currentStep === 'done') return 'complete'
    if (index === currentStepIndex) return 'active'
    return 'pending'
  }

  // Summary text for what will happen
  const summaryText = useMemo(() => {
    if (!plan) return ''

    if (plan.steps.length === 1 && plan.steps[0] === 'posting') {
      return 'Your bid will be submitted using your existing balance.'
    }

    const actions: string[] = []

    if (plan.needsBuy) {
      actions.push(`buy ${formatAmount(plan.buyAmount)} ANON`)
    }
    if (plan.needsDeposit && !plan.needsBuy) {
      actions.push(`deposit ${formatAmount(plan.depositAmount)} ANON from your public balance`)
    } else if (plan.needsDeposit) {
      actions.push('deposit the purchased tokens')
    }
    if (plan.needsConsolidate) {
      actions.push('merge your notes into one')
    }
    actions.push('submit your bid')

    if (actions.length === 1) {
      return `We'll ${actions[0]}.`
    }

    const last = actions.pop()
    return `We'll ${actions.join(', ')}, and then ${last}.`
  }, [plan, formatAmount])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Post Bid
          </DialogTitle>
          <DialogDescription>
            {state.status === 'success'
              ? 'Your bid has been submitted!'
              : `Bidding ${formatAmountWithUsd(bidAmount)}`}
          </DialogDescription>
        </DialogHeader>

        {state.status === 'success' ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <p className="mt-3 font-semibold">Bid Submitted!</p>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              If your bid is highest when the slot ends, your post will be published.
            </p>
            <button
              onClick={handleClose}
              className="mt-4 cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:scale-105"
            >
              Done
            </button>
          </div>
        ) : state.status === 'error' ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <p className="mt-3 font-semibold">Something went wrong</p>
            <p className="mt-1 text-center text-sm text-red-400">{state.error}</p>
            <button
              onClick={reset}
              className="mt-4 cursor-pointer rounded-xl border border-border px-6 py-2.5 text-sm font-semibold transition-all hover:bg-muted"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">{summaryText}</p>
            </div>

            {/* Steps visualization */}
            {plan && (
              <div className="space-y-2">
                {plan.steps.map((step, index) => {
                  const status = getStepStatus(step, index)
                  const StepIcon = STEP_LABELS[step].icon

                  return (
                    <div
                      key={step}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                        status === 'active'
                          ? 'border-primary/50 bg-primary/10'
                          : status === 'complete'
                            ? 'border-green-500/30 bg-green-500/5'
                            : 'border-border/30 bg-muted/20'
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          status === 'active'
                            ? 'bg-primary text-primary-foreground'
                            : status === 'complete'
                              ? 'bg-green-500/20 text-green-500'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {status === 'active' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : status === 'complete' ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <StepIcon className="h-4 w-4" />
                        )}
                      </div>
                      <span
                        className={`text-sm font-medium ${
                          status === 'active'
                            ? 'text-foreground'
                            : status === 'complete'
                              ? 'text-green-500'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {status === 'active' ? STEP_LABELS[step].activeLabel : STEP_LABELS[step].label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Collapsible details */}
            <div className="rounded-lg border border-border/50">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex w-full items-center justify-between p-3 text-sm text-muted-foreground hover:text-foreground"
              >
                <span>Details</span>
                {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showDetails && plan && (
                <div className="space-y-2 border-t border-border/50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bid amount</span>
                    <span>{formatAmountWithUsd(plan.bidAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Private balance</span>
                    <span>{formatAmountWithUsd(plan.totalPrivateBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Public balance</span>
                    <span>{formatAmountWithUsd(plan.publicBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Notes</span>
                    <span>{notes.length}</span>
                  </div>
                  {plan.needsBuy && (
                    <div className="flex justify-between text-yellow-500">
                      <span>Need to buy</span>
                      <span>{formatAmount(plan.buyAmount)} ANON</span>
                    </div>
                  )}
                  {plan.needsDeposit && (
                    <div className="flex justify-between text-blue-500">
                      <span>Need to deposit</span>
                      <span>{formatAmount(plan.depositAmount)} ANON</span>
                    </div>
                  )}
                  {plan.needsConsolidate && (
                    <div className="flex justify-between text-purple-500">
                      <span>Notes to merge</span>
                      <span>{plan.consolidateNotes.length}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Progress indicator when running */}
            {state.status === 'running' && state.progress.label && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">{state.progress.label}</span>
                </div>
                {state.progress.total > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${(state.progress.current / state.progress.total) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Action button */}
            {!hasStarted && (
              <button
                onClick={handleStart}
                disabled={!plan}
                className="w-full cursor-pointer rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                {plan?.steps.length === 1 ? 'Post Bid' : 'Start'}
              </button>
            )}

            {plan && !hasStarted && (
              <p className="text-center text-xs text-muted-foreground">
                {plan.steps.length === 1
                  ? 'This will submit your bid instantly.'
                  : `This will take ${plan.steps.length} steps. You may need to confirm transactions in your wallet.`}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
