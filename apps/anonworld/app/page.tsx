'use client'

import { PostFeed } from '../../../packages/react/src'
import { View } from '@anonworld/ui'
export default function Home() {
  return (
    <View maxWidth={700} mx="auto">
      <PostFeed fid={899289} type="new" />
    </View>
  )
}
