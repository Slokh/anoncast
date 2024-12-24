import { Plus } from '@tamagui/lucide-icons'
import { Adapt, Button, Dialog, Label, Sheet, Text, XStack, YStack } from '@anonworld/ui'
import { CredentialTypeSelect } from './select'
import { NewCredentialForm } from './form'
import { useNewCredential } from './context'

export function NewCredentialDialog() {
  const { isOpen, setIsOpen } = useNewCredential()
  return (
    <Dialog modal open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <Button size="$3" themeInverse bg="$background" br="$12">
          <XStack ai="center" gap="$2">
            <Plus size={16} strokeWidth={2.5} />
            <Text fos="$2" fow="600">
              Add Credential
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
          w={600}
        >
          <Dialog.Title>Add Credential</Dialog.Title>
          <YStack>
            <Label fos="$1" fow="400" color="$color11" textTransform="uppercase">
              Credential Type
            </Label>
            <CredentialTypeSelect />
          </YStack>
          <NewCredentialForm />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
