'use client'

import { useToast } from '@/lib/hooks/use-toast'
import {
  FarcasterCast,
  FarcasterChannel,
  CredentialWithId,
  useExecuteActions,
  encodeJson,
} from '@anonworld/react'
import { useRouter } from 'next/navigation'
import { createContext, useContext, useState, ReactNode } from 'react'
import { hashMessage } from 'viem'
import { ToastAction } from '../ui/toast'
import { CREATE_POST_ACTION_ID } from '@/lib/utils'

type Variant = 'anoncast' | 'anonfun' | 'anon' | 'anonpub'

interface CreatePostContextProps {
  text: string | null
  setText: (text: string) => void
  image: string | null
  setImage: (image: string | null) => void
  embed: string | null
  setEmbed: (embed: string | null) => void
  quote: FarcasterCast | null
  setQuote: (quote: FarcasterCast | null) => void
  channel: FarcasterChannel | null
  setChannel: (channel: FarcasterChannel | null) => void
  parent: FarcasterCast | null
  setParent: (parent: FarcasterCast | null) => void
  createPost: () => Promise<void>
  embedCount: number
  confetti: boolean
  setConfetti: (confetti: boolean) => void
  revealPhrase: string | null
  setRevealPhrase: (revealPhrase: string | null) => void
  variant: Variant
  setVariant: (variant: Variant) => void
  credential: CredentialWithId | null
  setCredential: (credential: CredentialWithId | null) => void
  isPending: boolean
}

const CreatePostContext = createContext<CreatePostContextProps | undefined>(undefined)

export const CreatePostProvider = ({
  initialVariant,
  children,
}: {
  children: ReactNode
  initialVariant?: Variant
}) => {
  const [text, setText] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [embed, setEmbed] = useState<string | null>(null)
  const [quote, setQuote] = useState<FarcasterCast | null>(null)
  const [channel, setChannel] = useState<FarcasterChannel | null>(null)
  const [parent, setParent] = useState<FarcasterCast | null>(null)
  const [revealPhrase, setRevealPhrase] = useState<string | null>(null)
  const [confetti, setConfetti] = useState(false)
  const { toast } = useToast()
  const [variant, setVariant] = useState<Variant>(initialVariant || 'anoncast')
  const [credential, setCredential] = useState<CredentialWithId | null>(null)
  const router = useRouter()
  const { mutateAsync, isPending } = useExecuteActions({
    credentials: credential ? [credential] : [],
    actions: [
      {
        actionId: CREATE_POST_ACTION_ID,
        data: {
          text: text,
          reply: parent
            ? `https://warpcast.com/${parent.author.username}/${parent.hash.slice(0, 10)}`
            : null,
          links: quote
            ? [`https://warpcast.com/${quote.author.username}/${quote.hash.slice(0, 10)}`]
            : embed
              ? [embed]
              : [],
          images: image ? [image] : [],
          copyActionIds: ['666be9bc-c682-446f-9d2e-350a3c80cdc5'],
          revealHash: revealPhrase
            ? hashMessage(
                encodeJson({
                  text: text,
                  reply: parent
                    ? `https://warpcast.com/${parent.author.username}/${parent.hash.slice(0, 10)}`
                    : null,
                  links: embed ? [embed] : [],
                  images: image ? [image] : [],
                }) + revealPhrase
              )
            : undefined,
        },
      },
    ],
    onSuccess: (response) => {
      setText(null)
      setImage(null)
      setEmbed(null)
      setQuote(null)
      setChannel(null)
      setParent(null)
      setRevealPhrase(null)
      setConfetti(true)
      toast({
        title: 'Post created',
        action: (
          <ToastAction
            altText="View post"
            onClick={() => {
              const hash = response.findLast((r) => r.hash)?.hash
              window.open(`https://warpcast.com/~/conversations/${hash}`, '_blank')
            }}
          >
            View on Warpcast
          </ToastAction>
        ),
      })
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to post',
        description: error.message,
      })
    },
  })

  const createPost = async () => {
    if (!credential) {
      toast({
        variant: 'destructive',
        title: 'No credential selected',
        description: 'Please select a credential to post.',
      })
      return
    }

    await mutateAsync()
  }

  const embedCount = [image, embed, quote].filter((e) => e !== null).length

  const handleSetVariant = (variant: Variant) => {
    setVariant(variant)
    router.push(`/${variant}`)
  }

  return (
    <CreatePostContext.Provider
      value={{
        text,
        setText,
        image,
        setImage,
        embed,
        setEmbed,
        quote,
        setQuote,
        channel,
        setChannel,
        parent,
        setParent,
        embedCount,
        createPost,
        isPending,
        confetti,
        setConfetti,
        revealPhrase,
        setRevealPhrase,
        variant,
        setVariant: handleSetVariant,
        credential,
        setCredential,
      }}
    >
      {children}
    </CreatePostContext.Provider>
  )
}

export const useCreatePost = () => {
  const context = useContext(CreatePostContext)
  if (context === undefined) {
    throw new Error('useCreatePost must be used within a CreatePostProvider')
  }
  return context
}
