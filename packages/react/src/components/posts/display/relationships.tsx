import { Cast, Relationship } from '../../../types'
import { View } from '@anonworld/ui'
import { Farcaster } from '../../svg/farcaster'
import { X } from '../../svg/x'
import { useFarcasterUser } from '../../../hooks/use-farcaster-user'
import { Badge } from '../../badge'

export function PostRelationships({ post }: { post: Cast }) {
  const farcaster = post.relationships?.find((c) => c.target === 'farcaster')
  const twitter = post.relationships?.find((c) => c.target === 'twitter')

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
