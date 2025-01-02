import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from 'react'
import { Action, CredentialWithId } from '@anonworld/common'
import { useExecuteActions } from '../../../hooks/use-execute-actions'
import { useToastController } from '@anonworld/ui'
import { hashMessage } from 'viem'
import { encodeJson } from '../../../utils'
import { useRouter } from 'solito/navigation'

const ACTION_ID = 'b6ec8ee8-f8bf-474f-8b28-f788f37e4066'

export type Content = {
  url: string
  type: 'farcaster' | 'twitter' | 'image' | 'link' | 'unknown'
}

interface NewPostContextValue {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  credentials: CredentialWithId[]
  addCredential: (credential: CredentialWithId) => void
  removeCredential: (credential: CredentialWithId) => void
  reply: Content | null
  setReply: (reply: string | null) => void
  text: string | null
  setText: (text: string) => void
  link: Content | null
  setLink: (link: string | null) => void
  image: Content | null
  setImage: (image: string | null) => void
  post: () => void
  status: 'idle' | 'pending' | 'success' | 'error'
  error: Error | null
  revealPhrase: string | null
  setRevealPhrase: (revealPhrase: string | null) => void
  copyActions: Action[]
  setCopyActions: Dispatch<SetStateAction<Action[]>>
}

const NewPostContext = createContext<NewPostContextValue | null>(null)

export function NewPostProvider({
  children,
  initialReply,
  initialCredentials,
}: {
  children: React.ReactNode
  initialReply?: Content
  initialCredentials?: CredentialWithId[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [credentials, setCredentials] = useState<CredentialWithId[]>(
    initialCredentials || []
  )
  const [reply, setReply] = useState<Content | null>(initialReply || null)
  const [text, setText] = useState<string | null>(null)
  const [link, setLink] = useState<Content | null>(null)
  const [image, setImage] = useState<Content | null>(null)
  const [revealPhrase, setRevealPhrase] = useState<string | null>(null)
  const [copyActions, setCopyActions] = useState<Action[]>([])
  const toast = useToastController()
  const router = useRouter()

  useEffect(() => {
    if (isOpen) {
      if (initialReply) {
        setReply(initialReply)
      }
      if (initialCredentials) {
        setCredentials(initialCredentials)
      }
    }
  }, [isOpen, initialReply, initialCredentials])

  const {
    mutate: post,
    status,
    error,
  } = useExecuteActions({
    credentials,
    actions: [
      {
        actionId: ACTION_ID,
        data: {
          text: text,
          reply: reply?.url ?? null,
          links: link?.url ? [link.url] : [],
          images: image?.url ? [image.url] : [],
          copyActionIds: copyActions.map((action) => action.id),
          revealHash: revealPhrase
            ? hashMessage(
                encodeJson({
                  text: text,
                  reply: reply?.url ?? null,
                  links: link?.url ? [link.url] : [],
                  images: image?.url ? [image.url] : [],
                }) + revealPhrase
              )
            : undefined,
        },
      },
    ],
    onSuccess: (response) => {
      setIsOpen(false)
      setCredentials([])
      setReply(null)
      setLink(null)
      setImage(null)
      setText(null)
      toast.show('Created post', {
        duration: 3000,
      })
      const hash = response.findLast((r) => r.hash)?.hash
      if (hash) {
        router.push(`/posts/${hash}`)
      }
    },
  })

  const addCredential = (credential: CredentialWithId) => {
    if (credentials.some((c) => c.id === credential.id)) {
      return
    }
    setCredentials([...credentials, credential])
  }

  const removeCredential = (credential: CredentialWithId) => {
    setCredentials(credentials.filter((c) => c.id !== credential.id))
  }

  const parseContent = (url: string): Content => {
    try {
      const urlObject = new URL(url)
      const isFarcaster =
        urlObject.hostname === 'warpcast.com' &&
        (urlObject.pathname.match(/^\/[^/]+\/0x[a-f0-9]+$/) || // /<username>/0x<hash>
          urlObject.pathname.match(/^\/~\/conversations\/0x[a-f0-9]+$/)) // /~/conversations/0x<hash>
      const isTwitter =
        (urlObject.hostname === 'x.com' || urlObject.hostname === 'twitter.com') &&
        urlObject.pathname.match(/^\/[^/]+\/status\/\d+$/) // /<username>/status/<tweet_id>
      return {
        url,
        type: isFarcaster ? 'farcaster' : isTwitter ? 'twitter' : 'link',
      }
    } catch (e) {
      throw new Error('Invalid URL')
    }
  }

  const handleSetReply = (reply: string | null) => {
    if (reply === null) {
      setReply(null)
      return
    }

    if (reply === '') {
      setReply({
        url: '',
        type: 'unknown',
      })
      return
    }

    const content = parseContent(reply)

    if (!['farcaster', 'twitter'].includes(content.type)) {
      setReply(null)
      throw new Error('URL must be Warpcast or X/Twitter post')
    }

    setReply(content)
  }

  const handleSetLink = (link: string | null) => {
    if (link === null) {
      setLink(null)
      return
    }

    if (link === '') {
      setLink({
        url: '',
        type: 'unknown',
      })
      return
    }

    const content = parseContent(link)

    setLink(content)
  }

  const handleSetImage = (image: string | null) => {
    if (!image) {
      setImage(null)
      return
    }

    setImage({
      url: image,
      type: 'image',
    })
  }

  return (
    <NewPostContext.Provider
      value={{
        isOpen,
        setIsOpen,
        credentials,
        addCredential,
        removeCredential,
        reply,
        setReply: handleSetReply,
        text,
        setText,
        link,
        setLink: handleSetLink,
        image,
        setImage: handleSetImage,
        post,
        status,
        error,
        revealPhrase,
        setRevealPhrase,
        copyActions,
        setCopyActions,
      }}
    >
      {children}
    </NewPostContext.Provider>
  )
}

export function useNewPost() {
  const context = useContext(NewPostContext)
  if (!context) {
    throw new Error('useNewPost must be used within a NewPostProvider')
  }
  return context
}
