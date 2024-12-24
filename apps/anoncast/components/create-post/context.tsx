'use client'

import { useToast } from '@/lib/hooks/use-toast'
import { Cast, Channel, Credential } from '../../../../packages/react/src'
import { useRouter } from 'next/navigation'
import { createContext, useContext, useState, ReactNode } from 'react'
import { hashMessage } from 'viem'
import { ToastAction } from '../ui/toast'
import { CREATE_POST_ACTION_ID } from '@/lib/utils'
import { ExecuteActionsStatus, useExecuteActions } from '../../../../packages/react/src'

type Variant = 'anoncast' | 'anonfun' | 'anon'

interface CreatePostContextProps {
  text: string | null
  setText: (text: string) => void
  image: string | null
  setImage: (image: string | null) => void
  embed: string | null
  setEmbed: (embed: string | null) => void
  quote: Cast | null
  setQuote: (quote: Cast | null) => void
  channel: Channel | null
  setChannel: (channel: Channel | null) => void
  parent: Cast | null
  setParent: (parent: Cast | null) => void
  createPost: () => Promise<void>
  embedCount: number
  status: ExecuteActionsStatus
  confetti: boolean
  setConfetti: (confetti: boolean) => void
  revealPhrase: string | null
  setRevealPhrase: (revealPhrase: string | null) => void
  variant: Variant
  setVariant: (variant: Variant) => void
  credential: Credential | null
  setCredential: (credential: Credential | null) => void
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
  const [quote, setQuote] = useState<Cast | null>(null)
  const [channel, setChannel] = useState<Channel | null>(null)
  const [parent, setParent] = useState<Cast | null>(null)
  const [revealPhrase, setRevealPhrase] = useState<string | null>(null)
  const [confetti, setConfetti] = useState(false)
  const { toast } = useToast()
  const [variant, setVariant] = useState<Variant>(initialVariant || 'anoncast')
  const [credential, setCredential] = useState<Credential | null>(null)
  const router = useRouter()
  const { executeActions, status } = useExecuteActions({
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
        description: error,
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

    const data = {
      text: text ?? undefined,
      embeds: embed ? [embed] : undefined,
      images: image ? [image] : undefined,
      quote: quote?.hash,
      channel: channel?.id,
      parent: parent?.hash,
    }

    await executeActions([
      {
        actionId: CREATE_POST_ACTION_ID,
        data: {
          ...data,
          revealHash: revealPhrase
            ? hashMessage(JSON.stringify(data) + revealPhrase)
            : undefined,
        },
        credential,
      },
    ])
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
        status,
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
