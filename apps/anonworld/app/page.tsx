'use client'

import { useRouter } from 'next/navigation'
import { PostFeed } from '@anonworld/react'
import { View } from '@anonworld/ui'
export default function Home() {
  const router = useRouter()

  return (
    <View maxWidth={700} mx="auto" my="$4">
      <PostFeed
        fid={899289}
        type="new"
        onPress={(hash) => router.push(`/posts/${hash}`)}
      />
    </View>
  )
}
