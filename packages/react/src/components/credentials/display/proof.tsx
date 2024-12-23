import { Dialog, Text, TextArea, View, XStack } from '@anonworld/ui'
import { useCredential } from '../../../hooks/use-credential'
import { Credential } from '../../../types'
import { X } from '@tamagui/lucide-icons'

export function CredentialProof({
  open,
  onOpenChange,
  credential,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  credential: Credential
}) {
  const { data } = useCredential({ id: credential.id, enabled: open })
  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          key="overlay"
          animation="slow"
          opacity={0.5}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />

        <Dialog.Content
          bordered
          elevate
          key="content"
          animateOnly={['transform', 'opacity']}
          animation={[
            'quicker',
            {
              opacity: {
                overshootClamping: true,
              },
            },
          ]}
          enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
          exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
          gap="$4"
          w={600}
        >
          <XStack ai="center" jc="space-between">
            <Dialog.Title>Proof</Dialog.Title>
          </XStack>
          <TextArea
            value={JSON.stringify(data?.proof)}
            fg={1}
            userSelect="none"
            editable={false}
          />
          <View
            position="absolute"
            top="$2"
            right="$2"
            p="$2"
            br="$12"
            hoverStyle={{ bg: '$color5' }}
            cursor="pointer"
            onPress={() => onOpenChange(false)}
          >
            <X size={20} />
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
