'use client'

import { NewPost, PostFeedSelector, NewFeed } from '@anonworld/react'
import { XStack } from '@anonworld/ui'
import { Content } from '@/components/content'

export default function Home() {
  return (
    <Content>
      <XStack ai="center" jc="space-between" $xs={{ px: '$2' }}>
        <PostFeedSelector selected="new" />
        <NewPost />
      </XStack>
      <NewFeed fid={884230} />
    </Content>
  )
}
