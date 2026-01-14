'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount, useSignMessage, useReadContract } from 'wagmi'
import { hashMessage, formatUnits } from 'viem'

const ANON_TOKEN = '0x0Db510e79909666d6dEc7f5e49370838c16D950f'
const MIN_BALANCE = 5000n * 10n ** 18n // 5000 ANON
const PROMOTE_BALANCE = 2000000n * 10n ** 18n // 2M ANON for Twitter crosspost
const PROOF_STORAGE_KEY = 'anon_proof'
const PROOF_EXPIRY_MS = 2 * 24 * 60 * 60 * 1000 // 2 days in milliseconds

const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ImagePlus, Link2, X, Loader2, ShieldCheck, Clock } from 'lucide-react'
import { ImageUpload } from './image-upload'
import { EmbedInput } from './embed-input'
import { EmbedPreview } from './embed-preview'

const MAX_CHARS = 320

type ProofData = {
  proof: number[]
  publicInputs: string[]
}

type CachedProof = {
  proof: ProofData
  address: string
  createdAt: number
}

type ComposerState = 'idle' | 'signing' | 'proving' | 'posting' | 'success' | 'error'

function saveProofToStorage(address: string, proof: ProofData): void {
  const cached: CachedProof = {
    proof,
    address: address.toLowerCase(),
    createdAt: Date.now(),
  }
  localStorage.setItem(PROOF_STORAGE_KEY, JSON.stringify(cached))
}

function loadProofFromStorage(address: string): { proof: ProofData; expiresAt: number } | null {
  try {
    const stored = localStorage.getItem(PROOF_STORAGE_KEY)
    if (!stored) return null

    const cached: CachedProof = JSON.parse(stored)

    // Check if proof is for the same address
    if (cached.address.toLowerCase() !== address.toLowerCase()) {
      return null
    }

    // Check if proof has expired (2 days)
    if (Date.now() - cached.createdAt > PROOF_EXPIRY_MS) {
      localStorage.removeItem(PROOF_STORAGE_KEY)
      return null
    }

    return {
      proof: cached.proof,
      expiresAt: cached.createdAt + PROOF_EXPIRY_MS,
    }
  } catch {
    return null
  }
}

function formatTimeRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return 'expired'

  const hours = Math.floor(remaining / (1000 * 60 * 60))
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h`
  }
  if (hours > 0) {
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }
  const minutes = Math.floor(remaining / (1000 * 60))
  return `${minutes}m`
}

function CircularProgress({ length, max }: { length: number; max: number }) {
  const progress = Math.min((length / max) * 100, 100)
  const angle = Math.min((progress * 360) / 100, 359.9)
  const isOverLimit = length > max

  if (isOverLimit) {
    return (
      <span className="text-sm font-medium text-destructive">
        -{length - max}
      </span>
    )
  }

  // SVG circular progress
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

export function PostComposer() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: balance, isLoading: balanceLoading } = useReadContract({
    address: ANON_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const hasEnoughBalance = balance !== undefined && balance >= MIN_BALANCE

  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [embed, setEmbed] = useState<string | null>(null)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [showEmbedInput, setShowEmbedInput] = useState(false)
  const [state, setState] = useState<ComposerState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [proof, setProof] = useState<ProofData | null>(null)
  const [proofExpiresAt, setProofExpiresAt] = useState<number | null>(null)
  const [castHash, setCastHash] = useState<string | null>(null)
  const [tweetUrl, setTweetUrl] = useState<string | null>(null)
  const [twitterFailed, setTwitterFailed] = useState(false)

  // Derived state
  const canPromote = balance !== undefined && balance >= PROMOTE_BALANCE

  // Load cached proof on mount or address change
  useEffect(() => {
    if (address) {
      const cached = loadProofFromStorage(address)
      if (cached) {
        setProof(cached.proof)
        setProofExpiresAt(cached.expiresAt)
      } else {
        setProof(null)
        setProofExpiresAt(null)
      }
    }
  }, [address])

  const textLength = new Blob([text ?? '']).size
  const isOverLimit = textLength > MAX_CHARS
  const canSubmit = isConnected && text.trim().length > 0 && !isOverLimit && state === 'idle'

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.max(100, textareaRef.current.scrollHeight) + 'px'
    }
  }

  const generateProof = useCallback(async (): Promise<ProofData> => {
    if (!address) throw new Error('Not connected')

    setState('signing')
    setError(null)

    const message = `Verify $ANON balance for anonymous posting\n\nTimestamp: ${Date.now()}`
    const signature = await signMessageAsync({ message })
    const messageHash = hashMessage(message)

    setState('proving')

    const { AnonBalanceVerifier, BALANCE_THRESHOLDS } = await import('@anon/credentials')
    const verifier = new AnonBalanceVerifier()

    // First, get the actual balance to determine which threshold to use
    const { input } = await verifier.buildInput(address, BALANCE_THRESHOLDS.POST)
    const actualBalance = input.storageProof[0].value

    if (actualBalance < BALANCE_THRESHOLDS.POST) {
      throw new Error('Insufficient $ANON balance. Required: 5,000 ANON')
    }

    // Use the higher threshold if the user has enough for promotion
    // This allows the proof to show they can crosspost to Twitter
    const threshold = actualBalance >= BALANCE_THRESHOLDS.PROMOTE
      ? BALANCE_THRESHOLDS.PROMOTE
      : BALANCE_THRESHOLDS.POST

    // Rebuild input with the appropriate threshold
    const { input: finalInput } = await verifier.buildInput(address, threshold)

    const proofResult = await verifier.generateProof({
      ...finalInput,
      signature,
      messageHash,
    })

    return {
      proof: proofResult.proof,
      publicInputs: proofResult.publicInputs,
    }
  }, [address, signMessageAsync])

  const handleSubmit = useCallback(async () => {
    setError(null)
    setTwitterFailed(false)
    try {
      let currentProof = proof

      if (!currentProof) {
        currentProof = await generateProof()
        setProof(currentProof)
        setProofExpiresAt(Date.now() + PROOF_EXPIRY_MS)
        if (address) {
          saveProofToStorage(address, currentProof)
        }
      }

      setState('posting')

      const response = await fetch('/api/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof: currentProof,
          text: text.trim(),
          images: image ? [image] : undefined,
          embeds: embed ? [embed] : undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to post')
      }

      const data = await response.json()
      setCastHash(data.hash)
      setTweetUrl(data.tweetUrl || null)
      // Track if Twitter crosspost was expected but failed
      setTwitterFailed(data.tier === 'promote' && !data.tweetUrl)
      setState('success')

      setText('')
      setImage(null)
      setImageLoaded(false)
      setEmbed(null)
      setShowImageUpload(false)
      setShowEmbedInput(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setState('idle')
    }
  }, [proof, generateProof, text, image, embed, address])

  const resetState = useCallback(() => {
    setState('idle')
    setError(null)
    setCastHash(null)
    setTweetUrl(null)
    setTwitterFailed(false)
  }, [])

  if (!isConnected) {
    return null
  }

  if (!balanceLoading && !hasEnoughBalance) {
    const currentBalance = balance ? Number(formatUnits(balance, 18)).toLocaleString() : '0'
    return (
      <Card className='border-destructive/50 bg-destructive/10'>
        <CardContent className="gap-3 p-4">
            <p className="font-semibold text-destructive">Insufficient Balance</p>
            <p className="mt-1 text-sm text-muted-foreground">
              You need at least 5,000 $ANON to post. Your current balance is {currentBalance} $ANON.
            </p>
            <a
              href="https://app.uniswap.org/swap?outputCurrency=0x0Db510e79909666d6dEc7f5e49370838c16D950f&chain=base"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Buy $ANON
            </a>
        </CardContent>
      </Card>
    )
  }

  if (state === 'success' && castHash) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <p className="text-lg font-semibold">Posted successfully!</p>
          {twitterFailed && (
            <p className="text-sm text-muted-foreground">
              X crosspost failed (content may be filtered)
            </p>
          )}
          <div className="flex flex-row items-center gap-3">
            <a
              href={`https://farcaster.xyz/~/conversations/${castHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/70"
            >
              <svg className="h-4 w-4" viewBox="0 0 1000 1000" fill="currentColor">
                <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z"/>
                <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z"/>
                <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z"/>
              </svg>
              Farcaster
            </a>
            {tweetUrl && (
              <a
                href={tweetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/70"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X
              </a>
            )}
          </div>
          <Button onClick={resetState} className="cursor-pointer rounded-full px-6">
            Post Another
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          placeholder="What's happening, anon?"
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
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm font-medium text-destructive">
            Error: {error}
          </div>
        )}

        {/* Loading states */}
        {(state === 'signing' || state === 'proving' || state === 'posting') && (
          <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">
              {state === 'signing' && 'Sign message to verify wallet...'}
              {state === 'proving' && 'Generating ZK proof...'}
              {state === 'posting' && 'Posting to Farcaster...'}
            </span>
          </div>
        )}

        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {proof && proofExpiresAt && (
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-green-500" />
              Proof cached ({formatTimeRemaining(proofExpiresAt)})
            </span>
          )}
          {canPromote ? (
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Crosspost enabled
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              2M $ANON for X crosspost
            </span>
          )}
        </div>

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
              {state !== 'idle' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
