'use client'

import ActionComponent from '@/components/action'
import { PostFeed, PromotedFeed } from '@/components/post-feed'
import { CreatePostProvider, useCreatePost } from '@/components/create-post/context'
import { NavTabs } from '@/components/nav-tabs'

export default function Home() {
  return (
    <CreatePostProvider>
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
        {variant === 'anoncast' ? (
          <ActionComponent variant="post" />
        ) : (
          <ActionComponent
            variant="launch"
            title="Launch coins anonymously via @clanker"
            description="To launch on anonfun, mention @clanker and tell it what you want to launch: token name and image. The raw suggestions will be posted from @anoncast. Anyone that meets the requirements can then launch it to @anonfun via @clanker."
            requirements={[
              { amount: 10000000, label: 'Suggest to @Rumour' },
              { amount: 200000000, label: 'Launch to @anonfun' },
            ]}
          />
        )}
      </div>
      {variant === 'anoncast' && <PostFeed />}
      {variant === 'anonfun' && <PromotedFeed />}
    </div>
  )
}
