import { Cast } from '../../types'
import { formatAmount, timeAgo } from '../../utils'
import { Text, View, XStack, YStack } from '@anonworld/ui'
import { Heart, MessageSquare } from '@tamagui/lucide-icons'
import { CredentialBadge } from './credentials'
import { PostActions } from './actions'
import { PostRelationships } from './relationships'
import { PostEmbed } from './embeds'

export function Post({ post, onPress }: { post: Cast; onPress?: () => void }) {
  return (
    <YStack
      theme="surface1"
      bg="$background"
      bc="$borderColor"
      bbw="$0.5"
      p="$3"
      gap="$4"
      $gtXs={{
        br: '$4',
        bw: '$0.5',
      }}
      onPress={onPress}
      hoverStyle={{
        bg: '$color3',
      }}
      cursor="pointer"
      f={1}
    >
      <XStack gap="$2" ai="center">
        {post.credentials?.map((credential) => (
          <CredentialBadge key={credential.id} credential={credential} />
        ))}
      </XStack>
      <Text lineHeight={22}>{post.text}</Text>
      {post.embeds?.map((embed) => (
        <PostEmbed key={embed.url} embed={embed} />
      ))}
      <XStack jc="space-between" ai="center">
        <XStack ai="center" gap="$4">
          <Text fos="$2" fow="400" col="$color11">
            {timeAgo(post.timestamp)}
          </Text>
          <XStack ai="center" gap="$2">
            <Heart size={16} col="$color11" />
            <Text fos="$2" fow="400" col="$color11">
              {formatAmount(post.aggregate?.likes ?? post.reactions.likes_count)}
            </Text>
          </XStack>
          <XStack ai="center" gap="$2">
            <MessageSquare size={16} col="$color11" />
            <Text fos="$2" fow="400" col="$color11">
              {formatAmount(post.aggregate?.replies ?? post.replies.count)}
            </Text>
          </XStack>
        </XStack>
        <PostRelationships post={post} />
      </XStack>
      <View position="absolute" top="$2" right="$3">
        <PostActions post={post} />
      </View>
    </YStack>
  )
}
