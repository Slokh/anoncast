import { Cast } from '../../types'
import { formatAmount, timeAgo } from '../../utils'
import { Text, View, XStack, YStack } from '@anonworld/ui'
import { Heart, MessageSquare } from '@tamagui/lucide-icons'
import { CredentialBadge } from './credential'
import { PostActions } from './actions'
import { PostRelationships } from './relationships'

function getUserId(post: Cast) {
  const credentialId = post.credentials?.[0]?.id

  if (!credentialId) return

  let str = ''
  for (let i = 2; i < credentialId.length - 1; i += 2) {
    const num = Number.parseInt(credentialId.slice(i, i + 2), 16)
    if (!Number.isNaN(num)) {
      // num % 62 gives us 0-61
      const code = num % 62
      if (code < 26) {
        // 0-25 -> a-z
        str += String.fromCharCode(97 + code)
      } else if (code < 52) {
        // 26-51 -> A-Z
        str += String.fromCharCode(65 + (code - 26))
      } else {
        // 52-61 -> 0-9
        str += String.fromCharCode(48 + (code - 52))
      }
    }
  }
  return str.slice(0, 8)
}

function getColorFromUserId(userId?: string) {
  if (!userId) return 'hsl(0, 0%, 100%)'
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 70%, 85%)`
}

export function Post({ post }: { post: Cast }) {
  const userId = getUserId(post)
  const color = getColorFromUserId(userId)
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
      onPress={() => {
        window.open(`https://warpcast.com/~/conversations/${post.hash}`, '_blank')
      }}
    >
      <XStack gap="$2" ai="center">
        {/* {userId && (
          <View bg={color} br="$12" px="$2" py="$1.5">
            <Text fos="$1" fow="500" col="$color1">
              {userId}
            </Text>
          </View>
        )} */}
        {post.credentials?.map((credential) => (
          <CredentialBadge key={credential.id} credential={credential} />
        ))}
      </XStack>
      <Text lineHeight={22}>{post.text}</Text>
      <XStack jc="space-between" ai="center">
        <XStack ai="center" gap="$4">
          <Text fos="$2" fow="400" col="$color11">
            {timeAgo(post.timestamp)}
          </Text>
          <XStack ai="center" gap="$2">
            <Heart size={16} col="$color11" />
            <Text fos="$2" fow="400" col="$color11">
              {formatAmount(post.reactions.likes_count)}
            </Text>
          </XStack>
          <XStack ai="center" gap="$2">
            <MessageSquare size={16} col="$color11" />
            <Text fos="$2" fow="400" col="$color11">
              {formatAmount(post.replies.count)}
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
