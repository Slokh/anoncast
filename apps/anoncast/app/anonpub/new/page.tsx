'use client'

import { CreatePostProvider, useCreatePost } from '@/components/create-post/context'
import { NavTabs } from '@/components/nav-tabs'

export default function AnonpubNewPage() {
  return (
    <CreatePostProvider initialVariant="anonpub">
      <Inner />
    </CreatePostProvider>
  )
}

function Inner() {
  const { variant } = useCreatePost()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <NavTabs />
      </div>
      {variant === 'anonpub' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold">New Articles</h1>
            <p className="text-zinc-400">Recently published anonymous articles</p>
          </div>
          <div className="text-center py-12 text-muted-foreground">
            New articles feed coming soon...
          </div>
        </div>
      )}
    </div>
  )
}
