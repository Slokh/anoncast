'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { Card, CardContent } from '@/components/ui/card'
import { ImagePlus, Link2, X, Loader2 } from 'lucide-react'
import { ImageUpload } from './image-upload'
import { EmbedInput } from './embed-input'
import { EmbedPreview } from './embed-preview'
import { PostModal } from './post-modal'
import { usePrivacyWallet } from '@/providers/privacy-wallet'
import { useTokenPrice } from '@/hooks/use-token-price'

const MAX_CHARS = 320

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
  } = usePrivacyWallet()

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
  const [apiHighestBid, setApiHighestBid] = useState('0')
  const [mockBidType, setMockBidType] = useState<MockBidType>('none')
  const [showPostModal, setShowPostModal] = useState(false)

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
  const currentHighestBid = mockBidType !== 'none' ? MOCK_BID_AMOUNTS[mockBidType] : apiHighestBid

  // Fetch current highest bid from API
  const fetchBid = useCallback(async () => {
    try {
      const res = await fetch('/api/auction/current')
      if (res.ok) {
        const data = await res.json()
        setApiHighestBid(data.highestBid || '0')
      }
    } catch {
      // Silent fail
    }
  }, [])

  useEffect(() => {
    fetchBid()

    // Listen for bid updates from other components
    const handleBidUpdate = () => fetchBid()
    window.addEventListener('auctionBidUpdate', handleBidUpdate)
    return () => window.removeEventListener('auctionBidUpdate', handleBidUpdate)
  }, [fetchBid])

  // Update bid amount when mock mode or highest bid changes
  useEffect(() => {
    const highestInTokens = Number(BigInt(currentHighestBid) / BigInt(10 ** 18))
    // Default to 1000 ANON, or highest + 1 if someone has already bid higher
    const minBid = Math.max(1000, highestInTokens + 1)
    setBidAmount(minBid.toString())
  }, [currentHighestBid])

  const textLength = new Blob([text ?? '']).size
  const isOverLimit = textLength > MAX_CHARS
  const charsRemaining = MAX_CHARS - textLength

  const bidAmountWei = bidAmount ? parseUnits(bidAmount, 18) : 0n
  const isValidBid = bidAmountWei > BigInt(currentHighestBid)

  const canPost =
    isConnected &&
    isUnlocked &&
    text.trim().length > 0 &&
    !isOverLimit &&
    !showPostModal &&
    isValidBid

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.max(100, textareaRef.current.scrollHeight) + 'px'
    }
  }

  const handlePost = useCallback(() => {
    if (!canPost) return
    setShowPostModal(true)
  }, [canPost])

  const handlePostSuccess = useCallback(() => {
    setShowPostModal(false)
    setText('')
    setImage(null)
    setEmbed(null)
    setBidAmount('')
  }, [])

  // Hide form if not connected
  if (!isConnected || !isUnlocked) {
    return null
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
                disabled={showPostModal}
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

              {walletError && (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-xs text-destructive">{walletError}</p>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowImageUpload(true)}
                    disabled={!!image || showPostModal}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setShowEmbedInput(true)}
                    disabled={!!embed || showPostModal}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <span
                  className={`flex h-7 items-center rounded-full bg-white/5 px-2.5 text-xs tabular-nums ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {charsRemaining}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">BID</span>
            <div className="relative border-b border-dashed border-muted-foreground/30">
              <span className="invisible font-mono text-xl font-bold tabular-nums">
                {bidAmount || '0'}
              </span>
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder="0"
                className="absolute inset-0 w-full appearance-none bg-transparent font-mono text-xl font-bold tabular-nums placeholder:text-muted-foreground focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              ANON
              {bidAmount &&
                formatUsdFromNumber(parseFloat(bidAmount) || 0) &&
                ` (${formatUsdFromNumber(parseFloat(bidAmount) || 0)})`}
            </span>
          </div>

          <button
            onClick={handlePost}
            disabled={!canPost}
            className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
          >
            Post
          </button>
        </div>

        {bidAmount && !isValidBid && (
          <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs text-destructive">
              Bid must be higher than {formatUnits(BigInt(currentHighestBid), 18)} ANON
            </p>
          </div>
        )}
      </CardContent>

      <PostModal
        open={showPostModal}
        onOpenChange={setShowPostModal}
        onSuccess={handlePostSuccess}
        bidAmount={bidAmountWei}
        content={{
          text,
          image: image ?? undefined,
          embed: embed ?? undefined,
        }}
      />
    </Card>
  )
}
