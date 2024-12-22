'use client'

import { useRouter } from 'next/navigation'
import { PostFeed, PostFeedSelector } from '@anonworld/react'
import { View } from '@anonworld/ui'

export default function Home() {
  const router = useRouter()

  const handleSelect = (sort: string) => {
    if (sort === 'new') {
      router.push('/new')
    } else {
      router.push('/')
    }
  }

  return (
    <View maxWidth={700} mx="auto" my="$3" gap="$3">
      <PostFeedSelector selected="New" onSelect={handleSelect} />
      <PostFeed
        fid={899289}
        type="new"
        onPress={(hash) => router.push(`/posts/${hash}`)}
      />
    </View>
  )
}
