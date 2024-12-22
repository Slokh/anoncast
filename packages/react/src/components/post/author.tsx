import { Cast } from '@anonworld/react'
import { Text, View } from '@anonworld/ui'

function getUserId(post: Cast) {
  const credentialId = post.credentials?.[0]?.id

  if (!credentialId) return

  let str = ''
  for (let i = 2; i < credentialId.length - 1; i += 2) {
    const num = Number.parseInt(credentialId.slice(i, i + 2), 16)
    if (!Number.isNaN(num)) {
      const code = num % 62
      if (code < 26) {
        str += String.fromCharCode(97 + code)
      } else if (code < 52) {
        str += String.fromCharCode(65 + (code - 26))
      } else {
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

export function PostAuthor({ post }: { post: Cast }) {
  const userId = getUserId(post)
  const color = getColorFromUserId(userId)

  if (!userId) return null

  return (
    <View bg={color} br="$12" px="$2" py="$1.5">
      <Text fos="$1" fow="500" col="$color1">
        {userId}
      </Text>
    </View>
  )
}
