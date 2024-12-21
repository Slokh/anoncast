import { usePosts } from '../hooks/use-posts'
import { YStack } from '@anonworld/ui'
import { Post } from './post'

export function PostFeed({ fid, type }: { fid: number; type: 'new' | 'trending' }) {
  const { data: posts, isLoading } = usePosts({
    fid,
    type,
  })

  return (
    <YStack $gtXs={{ gap: '$4' }}>
      {posts?.map((post) => (
        <Post key={post.hash} post={post} />
      ))}
    </YStack>
  )
}
