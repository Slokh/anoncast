'use client'

import { Content } from '@/components/content'
import { NewPost, PostFeedSelector, TrendingFeed } from '@anonworld/react'
import { XStack } from '@anonworld/ui'

export default function Home() {
  return (
    <Content>
      <XStack ai="center" jc="space-between" $xs={{ px: '$2' }}>
        <PostFeedSelector selected="trending" />
        <NewPost />
      </XStack>
      <TrendingFeed fid={884230} />
    </Content>
  )
}
