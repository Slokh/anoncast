import { Image, Link, Plus, Reply, WalletMinimal, X } from '@tamagui/lucide-icons'
import {
  Adapt,
  Button,
  Checkbox,
  Dialog,
  Sheet,
  Text,
  TextArea,
  XStack,
} from '@anonworld/ui'

export function PostComposer() {
  return (
    <Dialog modal>
      <Dialog.Trigger asChild>
        <Button size="$3" themeInverse bg="$background" br="$12">
          <XStack ai="center" gap="$2">
            <Plus size={16} strokeWidth={2.5} />
            <Text fos="$2" fow="600">
              Create Post
            </Text>
          </XStack>
        </Button>
      </Dialog.Trigger>

      <Adapt when="sm">
        <Sheet animation="quicker" zIndex={200000} modal dismissOnSnapToBottom>
          <Sheet.Frame padding="$4" gap="$2">
            <Adapt.Contents />
          </Sheet.Frame>
          <Sheet.Overlay
            animation="quicker"
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
        </Sheet>
      </Adapt>

      <Dialog.Portal>
        <Dialog.Overlay
          key="overlay"
          animation="quicker"
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
          gap="$2"
        >
          <XStack gap="$2">
            <WalletMinimal />
            <Text>5.0K ANON</Text>
          </XStack>
          <TextArea />
          <XStack>
            <Checkbox />
            <Text>Reveal my post</Text>
          </XStack>
          <XStack>
            <XStack>
              <Image />
              <Link />
              <Reply />
            </XStack>
            <Button size="$3" themeInverse bg="$background" br="$12">
              <Text fos="$2" fow="600">
                Post
              </Text>
            </Button>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
