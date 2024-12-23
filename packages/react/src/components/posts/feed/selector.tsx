import { Popover, Text, View, XStack, YGroup } from '@anonworld/ui'
import { ChevronDown } from '@tamagui/lucide-icons'
import { NamedExoticComponent } from 'react'

export function PostFeedSelector({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (sort: string) => void
}) {
  return (
    <View ai="flex-end">
      <Popover size="$5" allowFlip placement="bottom">
        <Popover.Trigger
          onPress={(e) => {
            e.stopPropagation()
          }}
        >
          <XStack
            bg="$background"
            py="$2"
            px="$3"
            br="$12"
            hoverStyle={{ bg: '$color5' }}
            cursor="pointer"
            gap="$2"
            ai="center"
            jc="flex-start"
          >
            <Text fos="$2" fow="400" color="$color11">
              {selected}
            </Text>
            <ChevronDown size={16} color="$color11" />
          </XStack>
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
            <ActionButton label="Sort by" />
            <ActionButton label="Trending" onPress={() => onSelect('trending')} />
            <ActionButton label="New" onPress={() => onSelect('new')} />
          </YGroup>
        </Popover.Content>
      </Popover>
    </View>
  )
}

function ActionButton({
  label,
  onPress,
  Icon,
  destructive = false,
}: {
  label: string
  onPress?: () => void
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
