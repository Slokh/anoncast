'use client'

import ActionComponent from '@/components/action'
import { PostFeed, PromotedFeed } from '@/components/post-feed'
import { ANON_ADDRESS } from '@anon/utils/src/config'
import AnimatedTabs from '@/components/post-feed/animated-tabs'
import { CreatePostProvider, useCreatePost } from '@/components/create-post/context'
import MainComponent from '@/components/nav-links'

export default function Home() {
  return (
    <CreatePostProvider tokenAddress={ANON_ADDRESS}>
      <MainComponent/>
      <Inner />
    </CreatePostProvider>
  )
}

function Inner() {
  const { variant, setVariant } = useCreatePost()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <AnimatedTabs
          tabs={['anoncast', { id: 'anonfun', badge: 'NEW' }]}
          activeTab={variant}
          onTabChange={(tab) => setVariant(tab as 'anoncast' | 'anonfun')}
          layoutId="main-tabs"
        />

        {variant === 'anoncast' ? (
          <ActionComponent tokenAddress={ANON_ADDRESS} variant="post" />
        ) : (
          <ActionComponent
            tokenAddress={ANON_ADDRESS}
            variant="launch"
            title="Launch coins anonymously via @clanker"
            description="To launch on anonfun, mention @clanker and tell it what you want to launch: token name and image. The raw suggestions will be posted from @rawanon. Anyone that meets the requirements can then launch it to @anonfun via @clanker."
            requirements={[
              { amount: 5000, label: 'Suggest to @rawanon' },
              { amount: 2000000, label: 'Launch to @anonfun' },
            ]}
          />
        )}
      </div>
      {variant === 'anoncast' && <PostFeed tokenAddress={ANON_ADDRESS} />}
      {variant === 'anonfun' && <PromotedFeed tokenAddress={ANON_ADDRESS} />}
    </div>
  )
}
