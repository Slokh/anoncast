import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { Cast, Channel } from '@/lib/types'
import { generateProof, ProofType } from '@anon/utils/src/proofs'
import { createContext, useContext, useState, ReactNode } from 'react'
import { hashMessage } from 'viem'
import { useAccount, useSignMessage } from 'wagmi'

type State =
  | {
      status: 'idle' | 'signature' | 'generating' | 'done'
    }
  | {
      status: 'error'
      error: string
    }

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
  state: State
  confetti: boolean
  setConfetti: (confetti: boolean) => void
  revealPhrase: string | null
  setRevealPhrase: (revealPhrase: string | null) => void
}

const CreatePostContext = createContext<CreatePostContextProps | undefined>(undefined)

export const CreatePostProvider = ({
  tokenAddress,
  children,
}: {
  tokenAddress: string
  children: ReactNode
}) => {
  const [text, setText] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [embed, setEmbed] = useState<string | null>(null)
  const [quote, setQuote] = useState<Cast | null>(null)
  const [channel, setChannel] = useState<Channel | null>(null)
  const [parent, setParent] = useState<Cast | null>(null)
  const [revealPhrase, setRevealPhrase] = useState<string | null>(null)
  const [state, setState] = useState<State>({ status: 'idle' })
  const [confetti, setConfetti] = useState(false)
  const { toast } = useToast()
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const resetState = () => {
    setState({ status: 'idle' })
    setText(null)
    setImage(null)
    setEmbed(null)
    setQuote(null)
    setChannel(null)
    setParent(null)
    setRevealPhrase(null)
  }

  const createPost = async () => {
    if (!address) return
    setState({ status: 'signature' })
    try {
      const embeds = [image, embed].filter((e) => e !== null) as string[]
      const input = {
        text,
        embeds,
        quote: quote?.hash ?? null,
        channel: channel?.id ?? null,
        parent: parent?.hash ?? null,
      }

      const message = JSON.stringify(input)
      const signature = await signMessageAsync({
        message,
      })
      if (!signature) {
        setState({ status: 'error', error: 'Failed to get signature' })
        return
      }

      const messageHash = hashMessage(message)
      const revealHash = revealPhrase ? hashMessage(message + revealPhrase) : null

      const timestamp = Math.floor(Date.now() / 1000)

      setState({ status: 'generating' })

      const proof = await generateProof({
        tokenAddress,
        userAddress: address,
        proofType: ProofType.CREATE_POST,
        signature: {
          timestamp,
          signature,
          messageHash,
        },
        input: {
          ...input,
          revealHash,
        },
      })
      if (!proof) {
        setState({ status: 'error', error: 'Not allowed to post' })
        return
      }

      if (process.env.NEXT_PUBLIC_DISABLE_QUEUE) {
        await api.createPost(Array.from(proof.proof), proof.publicInputs)
      } else {
        await api.submitAction(
          ProofType.CREATE_POST,
          Array.from(proof.proof),
          proof.publicInputs,
          {}
        )
      }

      resetState()
      setConfetti(true)
      toast({
        title: 'Post will be created in 1-2 minutes',
      })
    } catch (e) {
      setState({ status: 'error', error: 'Failed to post' })
      console.error(e)
    }
  }

  const embedCount = [image, embed, quote].filter((e) => e !== null).length

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
        state,
        confetti,
        setConfetti,
        revealPhrase,
        setRevealPhrase,
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
