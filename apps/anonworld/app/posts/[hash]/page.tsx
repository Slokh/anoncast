'use client'

import { Post, PostConversation, usePost, usePostConversation } from '@anonworld/react'
import { View } from '@anonworld/ui'

export default function Home({ params }: { params: { hash: string } }) {
  const { data: post } = usePost({ hash: params.hash })
  const { data: conversation } = usePostConversation({ hash: params.hash })

  return (
    <View maxWidth={700} mx="auto" my="$4" gap="$6">
      {post && <Post post={post} />}
      {conversation && <PostConversation conversation={conversation} />}
    </View>
  )
}
