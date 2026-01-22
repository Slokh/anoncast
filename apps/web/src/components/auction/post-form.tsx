'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { Card, CardContent } from '@/components/ui/card'
import {
  ImagePlus,
  Link2,
  X,
  Loader2,
  CheckCircle,
  ExternalLink,
} from 'lucide-react'
import { ImageUpload } from './image-upload'
import { EmbedInput } from './embed-input'
import { EmbedPreview } from './embed-preview'
import { DepositModal } from './deposit-modal'
import { usePrivacyWallet } from '@/providers/privacy-wallet'
import { useDeposit } from '@/hooks/use-deposit'
import { useTokenPrice } from '@/hooks/use-token-price'

const UNISWAP_URL = 'https://app.uniswap.org/swap?outputCurrency=0x0Db510e79909666d6dEc7f5e49370838c16D950f&chain=base'

const MAX_CHARS = 320

type FormState = 'idle' | 'generating_proof' | 'bidding' | 'success' | 'error'

type MockBidType = 'none' | 'text' | 'image' | 'link'

// Must match MOCK_BIDS in auction-timer.tsx
const MOCK_BID_AMOUNTS: Record<Exclude<MockBidType, 'none'>, string> = {
  text: '42000000000000000000', // 42 tokens
  image: '69000000000000000000', // 69 tokens
  link: '100000000000000000000', // 100 tokens
}

export function PostForm() {
  const { isConnected } = useAccount()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    isUnlocked,
    error: walletError,
    sync,
    prepareTransfer,
    canAffordTransfer,
    getClaimCredentials,
    markNoteSpent,
    generateDeposit,
  } = usePrivacyWallet()

  const { tokenBalance } = useDeposit()
  const { formatUsdFromNumber } = useTokenPrice()

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
  const [apiHighestBid, setApiHighestBid] = useState('0')
  const [mockBidType, setMockBidType] = useState<MockBidType>('none')
  const [showDepositModal, setShowDepositModal] = useState(false)

  // Check localStorage for mock bid setting
  useEffect(() => {
    const stored = localStorage.getItem('anon:mockBid') as MockBidType | null
    setMockBidType(stored || 'none')

    // Listen for mock bid toggle events
    const handleToggle = () => {
      const updated = localStorage.getItem('anon:mockBid') as MockBidType | null
      setMockBidType(updated || 'none')
    }
    window.addEventListener('storage', handleToggle)
    window.addEventListener('mockBidToggle', handleToggle)
    return () => {
      window.removeEventListener('storage', handleToggle)
      window.removeEventListener('mockBidToggle', handleToggle)
    }
  }, [])

  // Determine the effective highest bid (mock or real)
  const currentHighestBid = mockBidType !== 'none'
    ? MOCK_BID_AMOUNTS[mockBidType]
    : apiHighestBid

  // Fetch current highest bid from API
  useEffect(() => {
    async function fetchBid() {
      try {
        const res = await fetch('/api/auction/current')
        if (res.ok) {
          const data = await res.json()
          setApiHighestBid(data.highestBid || '0')
        }
      } catch {
        // Silent fail
      }
    }
    fetchBid()
  }, [])

  // Update bid amount when mock mode or highest bid changes
  useEffect(() => {
    const highestInTokens = Number(BigInt(currentHighestBid) / BigInt(10 ** 18))
    const nextBid = (highestInTokens + 1).toString()
    setBidAmount(nextBid)
  }, [currentHighestBid])

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

  // Hide form if not connected
  if (!isConnected || !isUnlocked) {
    return null
  }

  // Determine which button to show
  const publicBalance = tokenBalance ?? 0n
  const needsMoreFunds = !hasEnoughBalance && bidAmountWei > 0n
  const canDepositToAfford = needsMoreFunds && publicBalance >= bidAmountWei
  const needsToBuy = needsMoreFunds && !canDepositToAfford

  if (state === 'success') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">Bid Submitted!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              If your bid is the highest when the slot ends, your post will be published.
            </p>
          </div>
          <button
            onClick={resetState}
            className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-primary/40"
          >
            Place Another Bid
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent>
        <div className="px-4 pt-4 pb-3">
        <textarea
          ref={textareaRef}
          placeholder="What's happening, anon?"
          value={text}
          onChange={handleTextChange}
          disabled={state !== 'idle'}
          className="min-h-[100px] w-full resize-none bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
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
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs text-destructive">{error || walletError}</p>
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
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowImageUpload(true)}
              disabled={!!image || state !== 'idle'}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowEmbedInput(true)}
              disabled={!!embed || state !== 'idle'}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className={`flex h-7 items-center rounded-full bg-white/5 px-2.5 text-xs tabular-nums ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
            {charsRemaining}
          </span>
        </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">BID</span>
            <div className="relative border-b border-dashed border-muted-foreground/30">
              <span className="invisible font-mono text-xl font-bold tabular-nums">{bidAmount || '0'}</span>
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder="0"
                className="absolute inset-0 w-full appearance-none bg-transparent font-mono text-xl font-bold tabular-nums placeholder:text-muted-foreground focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              ANON{bidAmount && formatUsdFromNumber(parseFloat(bidAmount) || 0) && ` (${formatUsdFromNumber(parseFloat(bidAmount) || 0)})`}
            </span>
          </div>

          {needsToBuy ? (
            <a
              href={UNISWAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-primary/40"
            >
              Buy <ExternalLink className="h-3 w-3" />
            </a>
          ) : canDepositToAfford ? (
            <button
              onClick={() => setShowDepositModal(true)}
              className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-primary/40"
            >
              Deposit
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            >
              {state !== 'idle' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}
            </button>
          )}
        </div>

        {bidAmount && !isValidBid && (
          <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs text-destructive">
              Bid must be higher than {formatUnits(BigInt(currentHighestBid), 18)} ANON
            </p>
          </div>
        )}
      </CardContent>

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
