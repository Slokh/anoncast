'use client'

import ActionComponent from '@/components/action'
import { CreatePostProvider, useCreatePost } from '@/components/create-post/context'
import { CreateArticleProvider } from '@/components/create-article/context'
import { NavTabs } from '@/components/nav-tabs'

export default function AnonpubPage() {
  return (
    <CreatePostProvider initialVariant="anonpub">
      <CreateArticleProvider>
        <Inner />
      </CreateArticleProvider>
    </CreatePostProvider>
  )
}

function Inner() {
  const { variant } = useCreatePost()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <NavTabs />
        {variant === 'anonpub' && (
          <ActionComponent
            variant="article"
            title="Publish articles anonymously"
            description="Write and publish long-form articles anonymously. Articles are permanently stored on Arweave and viewable at anonpub.ar-io.dev"
            requirements={[{ amount: 5000, label: 'Publish articles' }]}
          />
        )}
      </div>
      {variant === 'anonpub' && (
        <div className="text-center py-12 text-muted-foreground">
          Article feed coming soon...
        </div>
      )}
    </div>
  )
}
