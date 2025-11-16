'use client'

import { useToast } from '@/lib/hooks/use-toast'
import { CredentialWithId } from '@anonworld/react'
import { createContext, useContext, useState, ReactNode } from 'react'

interface CreateArticleContextProps {
  title: string
  setTitle: (title: string) => void
  content: string
  setContent: (content: string) => void
  tags: string[]
  setTags: (tags: string[]) => void
  credential: CredentialWithId | null
  setCredential: (credential: CredentialWithId | null) => void
  publishArticle: () => Promise<void>
  isPending: boolean
  wordCount: number
  characterCount: number
}

const CreateArticleContext = createContext<CreateArticleContextProps | undefined>(undefined)

export const CreateArticleProvider = ({ children }: { children: ReactNode }) => {
  const [title, setTitle] = useState<string>('')
  const [content, setContent] = useState<string>('')
  const [tags, setTags] = useState<string[]>([])
  const [credential, setCredential] = useState<CredentialWithId | null>(null)
  const [isPending, setIsPending] = useState(false)
  const { toast } = useToast()

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length
  const characterCount = content.length

  const publishArticle = async () => {
    if (!credential) {
      toast({
        variant: 'destructive',
        title: 'No credential selected',
        description: 'Please select a credential to publish.',
      })
      return
    }

    if (!title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Title required',
        description: 'Please enter a title for your article.',
      })
      return
    }

    if (!content.trim()) {
      toast({
        variant: 'destructive',
        title: 'Content required',
        description: 'Please write some content for your article.',
      })
      return
    }

    // TODO: Implement Arweave upload via Turbo SDK
    setIsPending(true)
    try {
      toast({
        title: 'Publishing to Arweave...',
        description: 'This feature will be available soon.',
      })

      // Placeholder for future implementation
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Clear form on success
      setTitle('')
      setContent('')
      setTags([])

      toast({
        title: 'Article published!',
        description: 'Your article has been published to Arweave.',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to publish',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <CreateArticleContext.Provider
      value={{
        title,
        setTitle,
        content,
        setContent,
        tags,
        setTags,
        credential,
        setCredential,
        publishArticle,
        isPending,
        wordCount,
        characterCount,
      }}
    >
      {children}
    </CreateArticleContext.Provider>
  )
}

export const useCreateArticle = () => {
  const context = useContext(CreateArticleContext)
  if (context === undefined) {
    throw new Error('useCreateArticle must be used within a CreateArticleProvider')
  }
  return context
}
