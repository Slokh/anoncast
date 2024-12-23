import { View, Text } from '@anonworld/ui'

export function Badge({
  children,
  icon,
  onPress,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  onPress?: () => void
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
