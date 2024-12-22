import { Embed } from '@anonworld/sdk/types'
import { timeAgo } from '../../utils'
import { Avatar, Image, Text, View, XStack, YStack } from '@anonworld/ui'
import { useQuery } from '@tanstack/react-query'
import { X } from '../svg/x'

export function PostEmbed({ embed }: { embed: Embed }) {
  if (embed.cast) {
    const filteredEmbeds = embed.cast.embeds?.filter((e) => !e.cast)
    return (
      <YStack
        theme="surface1"
        bg="$background"
        bc="$borderColor"
        bw="$0.5"
        br="$4"
        p="$3"
        gap="$2"
      >
        <XStack ai="center" gap="$2">
          <Avatar size="$1" circular>
            <Avatar.Image src={embed.cast.author.pfp_url} />
            <Avatar.Fallback />
          </Avatar>
          <Text fos="$2" fow="500">
            {embed.cast.author.username}
          </Text>
          <Text fos="$2" fow="400" col="$color11">
            {timeAgo(embed.cast.timestamp)}
          </Text>
        </XStack>
        <Text lineHeight={22}>{embed.cast.text}</Text>
        {filteredEmbeds?.map((embed) => (
          <PostEmbed key={embed.url} embed={embed} />
        ))}
      </YStack>
    )
  }

  if (embed.metadata?.image) {
    return (
      <View>
        <Image
          src={embed.url}
          f={1}
          aspectRatio={embed.metadata.image.width_px / embed.metadata.image.height_px}
          br="$4"
        />
      </View>
    )
  }

  if (embed.url?.includes('x.com') || embed.url?.includes('twitter.com')) {
    const cleaned = embed.url.split('?')[0]
    const tweetId = cleaned.split('/').pop()
    const username = cleaned.split('/').slice(-3, -2).pop()
    if (tweetId && username) {
      return <TwitterEmbed tweetId={tweetId} username={username} />
    }
  }

  return (
    <Text
      col="$color11"
      onPress={() => window.open(embed.url, '_blank')}
      hoverStyle={{ textDecorationLine: 'underline' }}
    >
      {embed.url}
    </Text>
  )
}

function TwitterEmbed({ tweetId, username }: { tweetId: string; username: string }) {
  const { data } = useQuery({
    queryKey: ['twitter-embed', tweetId, username],
    queryFn: async () => {
      const url = `https://api.fxtwitter.com/${username}/status/${tweetId}`
      const response = await fetch(url)
      const data: {
        code: number
        message: string
        tweet: {
          url: string
          id: string
          text: string
          author: {
            id: string
            name: string
            screen_name: string
            avatar_url: string
            banner_url: string
            description: string
            location: string
            url: string
            followers: number
            following: number
            joined: string
            likes: number
            website: any
            tweets: number
            avatar_color: any
          }
          replies: number
          retweets: number
          likes: number
          created_at: string
          created_timestamp: number
          possibly_sensitive: boolean
          views: number
          is_note_tweet: boolean
          community_note: any
          lang: string
          replying_to: string
          replying_to_status: string
          media: {
            all: Array<{
              type: string
              url: string
              width: number
              height: number
              altText: string
            }>
            photos: Array<{
              type: string
              url: string
              width: number
              height: number
              altText: string
            }>
          }
          source: string
          twitter_card: string
          color: any
          provider: string
        }
      } = await response.json()
      return data.tweet
    },
  })

  if (!data) return null

  return (
    <YStack
      theme="surface1"
      bg="$background"
      bc="$borderColor"
      bw="$0.5"
      br="$4"
      p="$3"
      gap="$2"
    >
      <XStack ai="center" gap="$2">
        <X size={16} />
        <Text fos="$2" fow="500">
          {`@${data.author.screen_name}`}
        </Text>
        <Text fos="$2" fow="400" col="$color11">
          {timeAgo(data.created_at)}
        </Text>
      </XStack>
      <Text lineHeight={22}>{data.text}</Text>
      {data.media?.photos?.map((photo) => (
        <Image
          key={photo.url}
          src={photo.url}
          f={1}
          aspectRatio={photo.width / photo.height}
          br="$4"
        />
      ))}
    </YStack>
  )
}
