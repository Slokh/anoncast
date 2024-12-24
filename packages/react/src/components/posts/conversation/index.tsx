import { ConversationCast } from '@anonworld/react'
import { Avatar, Text, View, XStack, YStack } from '@anonworld/ui'
import { MessageCircle, MessageSquare } from '@tamagui/lucide-icons'
import { formatAmount } from '../../../utils'
import { PostEmbed } from '../display/embeds'
import { timeAgo } from '../../../utils'
import { Heart } from '@tamagui/lucide-icons'
import { PostActions } from './actions'

export function PostConversation({
  conversation,
}: {
  conversation: Array<ConversationCast>
}) {
  return (
    <YStack gap="$6">
      {conversation.map((post) => (
        <Post key={post.hash} post={post} />
      ))}
    </YStack>
  )
}

function Post({ post }: { post: ConversationCast }) {
  let text = post.text
  if (post.embeds) {
    for (const embed of post.embeds) {
      if (embed.url) {
        text = text.replace(embed.url, '')
      }
    }
  }

  return (
    <XStack br="$4" gap="$3">
      <Avatar size="$3" circular>
        <Avatar.Image src={post.author.pfp_url} />
        <Avatar.Fallback />
      </Avatar>
      <YStack gap="$2" f={1}>
        <XStack ai="center" gap="$2">
          <Text
            fow="600"
            fos="$2"
            cursor="pointer"
            onPress={() =>
              window.open(`https://warpcast.com/${post.author.username}`, '_blank')
            }
            hoverStyle={{ textDecorationLine: 'underline' }}
          >
            {post.author.username}
          </Text>
          <Text fos="$2" fow="400" col="$color11">
            {timeAgo(post.timestamp)}
          </Text>
        </XStack>
        <Text lineHeight={22}>{text}</Text>
        {post.embeds?.map((embed) => (
          <PostEmbed key={embed.url} embed={embed} />
        ))}
        <XStack ai="center" ml="$-3">
          <XStack
            py="$2"
            px="$3"
            br="$12"
            hoverStyle={{ bg: '$color5' }}
            gap="$2"
            ai="center"
            cursor="pointer"
          >
            <Heart size={16} col="$color11" />
            <Text fos="$2" col="$color11">
              {formatAmount(post.aggregate?.likes ?? post.reactions.likes_count)}
            </Text>
          </XStack>
          <XStack
            py="$2"
            px="$3"
            br="$12"
            hoverStyle={{ bg: '$color5' }}
            gap="$2"
            cursor="pointer"
            ai="center"
          >
            <MessageCircle size={16} col="$color11" />
            <Text fos="$2" col="$color11">
              Reply
            </Text>
          </XStack>
          <PostActions post={post} />
        </XStack>
      </YStack>
    </XStack>
  )
}
