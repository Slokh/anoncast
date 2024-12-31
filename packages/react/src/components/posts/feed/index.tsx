import { usePosts } from '../../../hooks/use-posts'
import { Spinner, Text, YStack } from '@anonworld/ui'
import { Post } from '../display'

export function PostFeed({
  fid,
  type,
  onPress,
}: {
  fid: number
  type: 'new' | 'trending'
  onPress: (hash: string) => void
}) {
  const { data, isLoading } = usePosts({
    fid,
    type,
  })

  if (isLoading) {
    return <Spinner color="$color12" />
  }

  if (!data || data.length === 0) {
    return (
      <Text fos="$2" fow="400" color="$color11" textAlign="center">
        No posts yet
      </Text>
    )
  }

  return (
    <YStack $gtXs={{ gap: '$4' }}>
      {data?.map((post) => (
        <Post key={post.hash} post={post} onPress={() => onPress(post.hash)} />
      ))}
    </YStack>
  )
}
