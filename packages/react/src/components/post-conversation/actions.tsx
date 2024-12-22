import { MoreHorizontal } from '@tamagui/lucide-icons'
import { Popover, Text, View, YGroup } from '@anonworld/ui'
import { Cast } from '../../types'
import { Farcaster } from '../svg/farcaster'
import { NamedExoticComponent } from 'react'

export function PostActions({ post }: { post: Cast }) {
  return (
    <Popover size="$5" allowFlip placement="bottom">
      <Popover.Trigger
        onPress={(e) => {
          e.stopPropagation()
        }}
      >
        <View
          bg="$background"
          p="$2"
          br="$12"
          hoverStyle={{ bg: '$color5' }}
          cursor="pointer"
        >
          <MoreHorizontal size={16} col="$color11" />
        </View>
      </Popover.Trigger>
      <Popover.Content
        enterStyle={{ y: -10, opacity: 0 }}
        exitStyle={{ y: -10, opacity: 0 }}
        elevate
        animation={[
          '100ms',
          {
            opacity: {
              overshootClamping: true,
            },
          },
        ]}
        padding="$0"
        cursor="pointer"
        bordered
        overflow="hidden"
      >
        <YGroup>
          <ActionButton
            label="View on Farcaster"
            onPress={() =>
              window.open(`https://warpcast.com/~/conversations/${post.hash}`, '_blank')
            }
            Icon={Farcaster}
          />
        </YGroup>
      </Popover.Content>
    </Popover>
  )
}

function ActionButton({
  label,
  onPress,
  Icon,
  destructive = false,
}: {
  label: string
  onPress: () => void
  Icon?: NamedExoticComponent<any>
  destructive?: boolean
}) {
  return (
    <YGroup.Item>
      <View
        onPress={onPress}
        fd="row"
        ai="center"
        gap="$2"
        px="$3.5"
        py="$2.5"
        hoverStyle={{ bg: '$color5' }}
      >
        {Icon && <Icon size={16} color={destructive ? '$red9' : undefined} />}
        <Text fos="$2" fow="400" color={destructive ? '$red9' : undefined}>
          {label}
        </Text>
      </View>
    </YGroup.Item>
  )
}
