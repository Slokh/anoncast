import { MoreHorizontal, Trash } from '@tamagui/lucide-icons'
import { Button, Popover, Text, View, YGroup } from '@anonworld/ui'
import { useActions } from '../../../hooks/use-actions'
import { Action, ActionType, Cast } from '../../../types'
import { useSDK } from '../../../providers/sdk'
import { getUsableCredential } from '../../../utils'
import { Farcaster } from '../../svg/farcaster'
import { X } from '../../svg/x'
import { NamedExoticComponent } from 'react'

export function PostActions({ post }: { post: Cast }) {
  const { data } = useActions()
  const actions = data?.sort((a, b) => a.type.localeCompare(b.type))
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
          <MoreHorizontal size={20} />
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
          {data?.map((action) => (
            <ActionItem key={action.id} post={post} action={action} />
          ))}
        </YGroup>
      </Popover.Content>
    </Popover>
  )
}

function ActionItem({ post, action }: { post: Cast; action: Action }) {
  const { credentials } = useSDK()
  const credential = getUsableCredential(credentials.credentials, action)
  if (!credential) {
    return null
  }

  switch (action.type) {
    case ActionType.COPY_POST_TWITTER: {
      const hasRelationship = post.children.some(
        (c) => c.targetAccount === action.metadata.target.post.text
      )
      if (hasRelationship) {
        return null
      }

      const isValidEq =
        !action.metadata.target.post.text.eq ||
        action.metadata.target.post.text.eq.some((text) =>
          post.text.toLowerCase().match(text)
        )
      const isValidNe =
        !action.metadata.target.post.text.ne ||
        !action.metadata.target.post.text.ne.some((text) =>
          post.text.toLowerCase().match(text)
        )

      if (!isValidEq || !isValidNe) {
        return null
      }

      return (
        <ActionButton
          label={`Promote to @${action.metadata.twitter}`}
          onPress={() => {}}
          icon={X}
        />
      )
    }
    case ActionType.DELETE_POST_TWITTER: {
      const hasRelationship = post.children.some(
        (c) => c.targetAccount === action.metadata.twitter
      )
      if (!hasRelationship) {
        return null
      }
      return (
        <ActionButton
          label={`Delete from @${action.metadata.twitter}`}
          onPress={() => {}}
          icon={Trash}
          destructive
        />
      )
    }
    case ActionType.COPY_POST_FARCASTER: {
      const hasRelationship = post.children.some(
        (c) => c.targetAccount === action.metadata.fid
      )
      if (hasRelationship) {
        return null
      }

      const validateEq = action.metadata.target.post.text.eq?.some((text) =>
        post.text.toLowerCase().match(text)
      )
      const validateNe = action.metadata.target.post.text.ne?.some(
        (text) => !post.text.toLowerCase().match(text)
      )

      if (!validateEq || !validateNe) {
        return null
      }

      return (
        <ActionButton label="Promote to Farcaster" onPress={() => {}} icon={Farcaster} />
      )
    }
    case ActionType.DELETE_POST_FARCASTER: {
      const hasRelationship = post.children.some(
        (c) => c.targetAccount === action.metadata.fid
      )
      if (!hasRelationship) {
        return null
      }
      return (
        <ActionButton
          label="Delete from Farcaster"
          onPress={() => {}}
          icon={Trash}
          destructive
        />
      )
    }
  }

  return null
}

function ActionButton({
  label,
  onPress,
  icon,
  destructive = false,
}: {
  label: string
  onPress: () => void
  icon?: NamedExoticComponent
  destructive?: boolean
}) {
  return (
    <YGroup.Item>
      <Button
        onPress={onPress}
        icon={icon}
        scaleIcon={0.75}
        justifyContent="flex-start"
        size="$3"
      >
        <Text fos="$2" fow="400" color={destructive ? '$red9' : undefined}>
          {label}
        </Text>
      </Button>
    </YGroup.Item>
  )
}
