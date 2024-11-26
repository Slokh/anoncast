'use client'

import ActionComponent from '@/components/action'
import PostFeed from '@/components/post-feed'
import { ANON_ADDRESS } from '@anon/utils/src/config'
import AnimatedTabs from '@/components/post-feed/animated-tabs'
import { useState } from 'react'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'anoncast' | 'anonfun'>('anoncast')

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <AnimatedTabs
          tabs={[
            'anoncast',
            { id: 'anonfun', badge: 'NEW' }
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as 'anoncast' | 'anonfun')}
          layoutId="main-tabs"
        />
        
        {activeTab === 'anoncast' ? (
          <ActionComponent tokenAddress={ANON_ADDRESS} variant="post" />
        ) : (
          <ActionComponent 
            tokenAddress={ANON_ADDRESS}
            variant="launch"
            title="Launch coins anonymously via @clanker"
            description="To launch an anon token, mention @clanker and tell it what you want to launch: token name and image. Similar to anoncast, it will first be posted from @anonfun where it will launch via @clanker."
            requirements={[
              { amount: 5000, label: "Post to @anonfun (@clanker doesn't listen)" },
              { amount: 2000000, label: "Promote to @anonfun (@clanker listens)" }
            ]}
          />
        )}
      </div>
      <PostFeed tokenAddress={ANON_ADDRESS} />
    </div>
  )
}
