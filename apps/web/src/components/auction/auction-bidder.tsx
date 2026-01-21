'use client'

import { useState, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ImagePlus,
  Link2,
  X,
  Loader2,
  Wallet,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Plus,
} from 'lucide-react'
import { ImageUpload } from './image-upload'
import { EmbedInput } from './embed-input'
import { EmbedPreview } from './embed-preview'
import { DepositModal } from './deposit-modal'
import { usePrivacyWallet } from '@/providers/privacy-wallet'
import { useDeposit } from '@/hooks/use-deposit'

const MAX_CHARS = 320

type BidderState = 'idle' | 'generating_proof' | 'bidding' | 'success' | 'error'

function CircularProgress({ length, max }: { length: number; max: number }) {
  const progress = Math.min((length / max) * 100, 100)
  const isOverLimit = length > max

  if (isOverLimit) {
    return <span className="text-sm font-medium text-destructive">-{length - max}</span>
  }

  const radius = 10
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className="relative flex h-6 w-6 items-center justify-center">
      <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24">
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted"
        />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-foreground transition-all"
        />
      </svg>
    </div>
  )
}

export function AuctionBidder() {
  const { isConnected } = useAccount()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Privacy wallet
  const {
    isUnlocked,
    isSyncing,
    balance,
    error: walletError,
    sync,
    prepareTransfer,
    canAffordTransfer,
    getClaimCredentials,
    formatBalance,
    markNoteSpent,
    generateDeposit,
  } = usePrivacyWallet()

  // Token balance (for deposit)
  const { tokenBalance, formatTokenAmount } = useDeposit()

  // Form state
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [embed, setEmbed] = useState<string | null>(null)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [showEmbedInput, setShowEmbedInput] = useState(false)
  const [bidAmount, setBidAmount] = useState('')
  const [showDepositModal, setShowDepositModal] = useState(false)

  // Bidding state
  const [state, setState] = useState<BidderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [currentHighestBid, setCurrentHighestBid] = useState('0')

  const textLength = new Blob([text ?? '']).size
  const isOverLimit = textLength > MAX_CHARS

  const bidAmountWei = bidAmount ? parseUnits(bidAmount, 18) : 0n
  const isValidBid = bidAmountWei > BigInt(currentHighestBid)
  const hasEnoughBalance = canAffordTransfer(bidAmountWei)

  const canSubmit =
    isConnected &&
    isUnlocked &&
    text.trim().length > 0 &&
    !isOverLimit &&
    state === 'idle' &&
    isValidBid &&
    hasEnoughBalance

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.max(100, textareaRef.current.scrollHeight) + 'px'
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return

    setError(null)
    setState('generating_proof')

    try {
      // Get current slot ID
      const slotRes = await fetch('/api/auction/current')
      const slotData = await slotRes.json()
      const slotId = slotData.currentSlotId

      // Get claim credentials for this slot
      const claimCreds = getClaimCredentials(slotId)
      if (!claimCreds) {
        throw new Error('Wallet not unlocked')
      }

      // Prepare transfer (generates change note, gets merkle proof, etc.)
      const transferData = await prepareTransfer(bidAmountWei, claimCreds.claimCommitment)

      if (!transferData) {
        throw new Error('No available notes for this bid amount')
      }

      // TODO: Generate ZK proof
      // const verifier = new TransferVerifier(circuit, vkey)
      // const proof = await verifier.generateTransferProof({
      //   note: transferData.inputNote,
      //   merklePath: transferData.merkleProof.path,
      //   merkleIndices: transferData.merkleProof.indices,
      //   merkleRoot: transferData.merkleProof.root,
      //   outputAmount: bidAmountWei,
      //   changeNote: transferData.changeNote,
      //   outputCommitment: claimCreds.claimCommitment,
      // })

      // Mock proof for now
      const mockProof = {
        proof: [],
        publicInputs: [
          `0x${transferData.nullifierHash.toString(16)}`,
          `0x${transferData.merkleProof.root.toString(16)}`,
          `0x${bidAmountWei.toString(16)}`,
          `0x${transferData.changeNote.commitment.toString(16)}`,
          `0x${transferData.changeNote.amount.toString(16)}`,
          `0x${claimCreds.claimCommitment.toString(16)}`,
        ],
      }

      setState('bidding')

      const response = await fetch('/api/auction/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim(),
          images: image ? [image] : undefined,
          embeds: embed ? [embed] : undefined,
          bidAmount: bidAmountWei.toString(),
          proof: mockProof,
          outputCommitment: `0x${claimCreds.claimCommitment.toString(16)}`,
          changeCommitment: `0x${transferData.changeNote.commitment.toString(16)}`,
          changeAmount: transferData.changeNote.amount.toString(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit bid')
      }

      // Mark the input note as spent
      await markNoteSpent(transferData.inputNote.commitment, 'pending')

      setState('success')

      // Reset form
      setText('')
      setImage(null)
      setEmbed(null)
      setBidAmount('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setState('error')
    }
  }, [canSubmit, prepareTransfer, getClaimCredentials, bidAmountWei, text, image, embed, markNoteSpent])

  const resetState = useCallback(() => {
    setState('idle')
    setError(null)
  }, [])

  // Not connected or not unlocked - don't show bidder
  if (!isConnected || !isUnlocked) {
    return null
  }

  // No available balance - show deposit options
  if (balance && balance.available === 0n) {
    return (
      <>
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            {/* Pool Balance */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Pool Balance</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">
                  {formatBalance(balance.available)} $ANON
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={sync}
                  disabled={isSyncing}
                  className="h-6 w-6 cursor-pointer p-0"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Deposit section */}
            {tokenBalance && tokenBalance > 0n ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Wallet: <span className="font-mono font-semibold text-foreground">{formatTokenAmount(tokenBalance)} $ANON</span>
                </p>
                <Button
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => setShowDepositModal(true)}
                >
                  Deposit
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                You need $ANON tokens to deposit. Get some on{' '}
                <a
                  href="https://app.uniswap.org/swap?outputCurrency=0x0Db510e79909666d6dEc7f5e49370838c16D950f&chain=base"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Uniswap
                </a>
              </div>
            )}
          </CardContent>
        </Card>
        <DepositModal
          open={showDepositModal}
          onOpenChange={setShowDepositModal}
          onSuccess={() => setShowDepositModal(false)}
          generateDeposit={generateDeposit}
          sync={sync}
        />
      </>
    )
  }

  // Success state
  if (state === 'success') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-4">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <p className="text-lg font-semibold">Bid Submitted!</p>
          <p className="text-center text-sm text-muted-foreground">
            If your bid is the highest when the hour ends, your post will be published
            anonymously.
          </p>
          <Button onClick={resetState} className="cursor-pointer rounded-full px-6">
            Place Another Bid
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        {/* Balance display */}
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Available Balance</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold">
              {balance ? formatBalance(balance.available) : '0'} $ANON
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDepositModal(true)}
                disabled={!tokenBalance || tokenBalance === 0n}
                className="h-6 cursor-pointer px-2 text-xs"
                title="Deposit more $ANON"
              >
                <Plus className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={sync}
                disabled={isSyncing}
                className="h-6 w-6 cursor-pointer p-0"
              >
                <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Bid amount */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Bid Amount ($ANON)</label>
          <input
            type="number"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder={`Min: ${formatUnits(BigInt(currentHighestBid) + 1n, 18)}`}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          {bidAmount && !isValidBid && (
            <p className="text-xs text-destructive">
              Bid must be higher than {formatUnits(BigInt(currentHighestBid), 18)} $ANON
            </p>
          )}
          {bidAmount && !hasEnoughBalance && (
            <p className="text-xs text-destructive">Insufficient balance for this bid</p>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          placeholder="What's your post, anon?"
          value={text}
          onChange={handleTextChange}
          disabled={state !== 'idle'}
          className="min-h-[100px] w-full resize-none bg-transparent text-[16px] leading-normal placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />

        {/* Image preview */}
        {image && (
          <div className="relative overflow-hidden rounded-lg">
            {!imageLoaded && (
              <div className="flex h-[200px] items-center justify-center bg-muted">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <img
              src={image}
              alt="Upload"
              className={`max-h-[200px] w-full object-contain ${!imageLoaded ? 'hidden' : ''}`}
              onLoad={() => setImageLoaded(true)}
            />
            <button
              onClick={() => {
                setImage(null)
                setImageLoaded(false)
              }}
              className="absolute right-2 top-2 cursor-pointer rounded-full bg-black/50 p-1.5 hover:bg-black/70"
            >
              <X className="h-3 w-3" strokeWidth={3} />
            </button>
          </div>
        )}

        {/* Embed preview */}
        {embed && <EmbedPreview url={embed} onRemove={() => setEmbed(null)} />}

        {/* Image upload input */}
        {showImageUpload && !image && (
          <ImageUpload
            key={Date.now()}
            onUpload={(url) => {
              setImageLoaded(false)
              setImage(url)
              setShowImageUpload(false)
            }}
            onCancel={() => setShowImageUpload(false)}
          />
        )}

        {/* Embed URL input */}
        {showEmbedInput && !embed && (
          <EmbedInput
            onSubmit={(url) => {
              setEmbed(url)
              setShowEmbedInput(false)
            }}
            onCancel={() => setShowEmbedInput(false)}
          />
        )}

        {/* Error message */}
        {(error || walletError) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm font-medium text-destructive">
            Error: {error || walletError}
          </div>
        )}

        {/* Loading states */}
        {(state === 'generating_proof' || state === 'bidding') && (
          <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">
              {state === 'generating_proof' && 'Generating ZK proof...'}
              {state === 'bidding' && 'Submitting bid...'}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowImageUpload(true)}
              disabled={!!image || state !== 'idle'}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-muted transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className={`h-4 w-4 ${image ? 'text-primary' : ''}`} />
            </button>
            <button
              onClick={() => setShowEmbedInput(true)}
              disabled={!!embed || state !== 'idle'}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-muted transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Link2 className={`h-4 w-4 ${embed ? 'text-primary' : ''}`} />
            </button>
          </div>

          {/* Progress + Submit */}
          <div className="flex items-center gap-3">
            <CircularProgress length={textLength} max={MAX_CHARS} />
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="cursor-pointer rounded-full px-5 font-semibold disabled:cursor-not-allowed"
            >
              {state !== 'idle' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Place Bid'}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Deposit Modal */}
      <DepositModal
        open={showDepositModal}
        onOpenChange={setShowDepositModal}
        onSuccess={() => setShowDepositModal(false)}
        generateDeposit={generateDeposit}
        sync={sync}
      />
    </Card>
  )
}
