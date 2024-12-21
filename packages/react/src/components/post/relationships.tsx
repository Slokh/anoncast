import { Cast, Relationship } from '../../types'
import { Text, View } from '@anonworld/ui'
import { Farcaster } from '../svg/farcaster'
import { X } from '../svg/x'
import { useFarcasterUser } from '../../hooks/use-farcaster-user'

export function PostRelationships({ post }: { post: Cast }) {
  const farcaster = post.relationships.find((c) => c.target === 'farcaster')
  const twitter = post.relationships.find((c) => c.target === 'twitter')

  return (
    <View fd="row" gap="$2" ai="center">
      {farcaster && <FarcasterBadge farcaster={farcaster} />}
      {twitter && <TwitterBadge twitter={twitter} />}
    </View>
  )
}

function FarcasterBadge({ farcaster }: { farcaster: Relationship }) {
  const { data } = useFarcasterUser(farcaster.targetAccount)
  return (
    <Badge
      onPress={() => {
        window.open(
          `https://warpcast.com/~/conversations/${farcaster.targetId}`,
          '_blank'
        )
      }}
      icon={<Farcaster size={12} />}
    >
      {data?.username}
    </Badge>
  )
}

function TwitterBadge({ twitter }: { twitter: Relationship }) {
  return (
    <Badge
      onPress={() => {
        window.open(
          `https://x.com/${twitter.targetAccount}/status/${twitter.targetId}`,
          '_blank'
        )
      }}
      icon={<X size={10} />}
    >
      {twitter.targetAccount}
    </Badge>
  )
}

function Badge({
  children,
  icon,
  onPress,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onPress: () => void
}) {
  return (
    <View
      theme="surface3"
      bg="$background"
      bc="$borderColor"
      bw="$0.25"
      br="$12"
      px="$2"
      py="$1.5"
      fd="row"
      ai="center"
      gap="$1.5"
      onPress={onPress}
      cursor="pointer"
      hoverStyle={{ bg: '$color5' }}
    >
      {icon}
      <Text fos="$1">{children}</Text>
    </View>
  )
}
