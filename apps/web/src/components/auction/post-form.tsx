'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ImagePlus,
  Link2,
  X,
  Loader2,
  CheckCircle,
} from 'lucide-react'
import { ImageUpload } from './image-upload'
import { EmbedInput } from './embed-input'
import { EmbedPreview } from './embed-preview'
import { usePrivacyWallet } from '@/providers/privacy-wallet'

const MAX_CHARS = 320

type FormState = 'idle' | 'generating_proof' | 'bidding' | 'success' | 'error'

export function PostForm() {
  const { isConnected } = useAccount()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    isUnlocked,
    balance,
    error: walletError,
    prepareTransfer,
    canAffordTransfer,
    getClaimCredentials,
    markNoteSpent,
    formatBalance,
  } = usePrivacyWallet()

  // Form state
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [embed, setEmbed] = useState<string | null>(null)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [showEmbedInput, setShowEmbedInput] = useState(false)
  const [bidAmount, setBidAmount] = useState('')

  // Submission state
  const [state, setState] = useState<FormState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [currentHighestBid, setCurrentHighestBid] = useState('0')

  // Fetch current highest bid and set default
  useEffect(() => {
    async function fetchBid() {
      try {
        const res = await fetch('/api/auction/current')
        if (res.ok) {
          const data = await res.json()
          setCurrentHighestBid(data.highestBid || '0')
          // Set default bid to highest + 1 (in whole tokens)
          const highestInTokens = Number(BigInt(data.highestBid || '0') / BigInt(10 ** 18))
          const nextBid = (highestInTokens + 1).toString()
          setBidAmount(nextBid)
        }
      } catch {
        // Silent fail
      }
    }
    fetchBid()
  }, [])

  const textLength = new Blob([text ?? '']).size
  const isOverLimit = textLength > MAX_CHARS
  const charsRemaining = MAX_CHARS - textLength

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
      const slotRes = await fetch('/api/auction/current')
      const slotData = await slotRes.json()
      const slotId = slotData.currentSlotId

      const claimCreds = getClaimCredentials(slotId)
      if (!claimCreds) {
        throw new Error('Wallet not unlocked')
      }

      const transferData = await prepareTransfer(bidAmountWei, claimCreds.claimCommitment)

      if (!transferData) {
        throw new Error('No available notes for this bid amount')
      }

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

      await markNoteSpent(transferData.inputNote.commitment, 'pending')

      setState('success')

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

  if (!isConnected || !isUnlocked) {
    return null
  }

  if (!balance || balance.available === 0n) {
    return null
  }

  if (state === 'success') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <p className="text-lg font-semibold">Bid Submitted!</p>
          <p className="text-center text-sm text-muted-foreground">
            If your bid is the highest when the slot ends, your post will be published.
          </p>
          <Button onClick={resetState} className="cursor-pointer">
            Place Another Bid
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <textarea
          ref={textareaRef}
          placeholder="What's happening, anon?"
          value={text}
          onChange={handleTextChange}
          disabled={state !== 'idle'}
          className="min-h-[100px] w-full resize-none bg-transparent text-[15px] leading-normal placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />

        {image && (
          <div className="relative mt-3 overflow-hidden rounded-lg">
            {!imageLoaded && (
              <div className="flex h-[200px] items-center justify-center bg-muted">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <img
              src={image}
              alt="Upload"
              className={`max-h-[300px] w-full object-contain ${!imageLoaded ? 'hidden' : ''}`}
              onLoad={() => setImageLoaded(true)}
            />
            <button
              onClick={() => {
                setImage(null)
                setImageLoaded(false)
              }}
              className="absolute right-2 top-2 cursor-pointer rounded-full bg-black/50 p-1.5 hover:bg-black/70"
            >
              <X className="h-3 w-3 text-white" strokeWidth={3} />
            </button>
          </div>
        )}

        {embed && (
          <div className="mt-3">
            <EmbedPreview url={embed} onRemove={() => setEmbed(null)} />
          </div>
        )}

        {showImageUpload && !image && (
          <div className="mt-3">
            <ImageUpload
              key={Date.now()}
              onUpload={(url) => {
                setImageLoaded(false)
                setImage(url)
                setShowImageUpload(false)
              }}
              onCancel={() => setShowImageUpload(false)}
            />
          </div>
        )}

        {showEmbedInput && !embed && (
          <div className="mt-3">
            <EmbedInput
              onSubmit={(url) => {
                setEmbed(url)
                setShowEmbedInput(false)
              }}
              onCancel={() => setShowEmbedInput(false)}
            />
          </div>
        )}

        {(error || walletError) && (
          <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error || walletError}
          </div>
        )}

        {(state === 'generating_proof' || state === 'bidding') && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {state === 'generating_proof' && 'Generating proof...'}
            {state === 'bidding' && 'Submitting bid...'}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="-ml-1.5 flex items-center gap-2">
            <button
              onClick={() => setShowImageUpload(true)}
              disabled={!!image || state !== 'idle'}
              className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowEmbedInput(true)}
              disabled={!!embed || state !== 'idle'}
              className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Link2 className="h-5 w-5" />
            </button>
          </div>

          <span className={`text-xs ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
            {charsRemaining}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-baseline gap-2">
            <span className="mb-0.5 text-xs font-medium text-muted-foreground">Bid</span>
            <input
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              placeholder="0"
              className="flex-1 appearance-none bg-transparent text-2xl font-bold tabular-nums placeholder:text-muted-foreground focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            size="sm"
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            {state !== 'idle' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}
          </Button>
        </div>

        {bidAmount && !isValidBid && (
          <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Bid must be higher than {formatUnits(BigInt(currentHighestBid), 18)}
          </div>
        )}
        {bidAmount && isValidBid && !hasEnoughBalance && (
          <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Insufficient balance (have {formatBalance(balance.available)})
          </div>
        )}
      </CardContent>
    </Card>
  )
}
