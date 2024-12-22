import { usePosts } from '../../hooks/use-posts'
import { YStack } from '@anonworld/ui'
import { Post } from '../post'

export function PostFeed({
  fid,
  type,
  onPress,
}: {
  fid: number
  type: 'new' | 'trending'
  onPress: (hash: string) => void
}) {
  const { data: posts, isLoading } = usePosts({
    fid,
    type,
  })

  return (
    <YStack $gtXs={{ gap: '$4' }}>
      {posts?.map((post) => (
        <Post key={post.hash} post={post} onPress={() => onPress(post.hash)} />
      ))}
    </YStack>
  )
}
