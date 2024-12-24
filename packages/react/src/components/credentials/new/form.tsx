import {
  Adapt,
  Button,
  Circle,
  Image,
  Input,
  Label,
  Select,
  Sheet,
  Slider,
  Spinner,
  Text,
  View,
  XStack,
  YStack,
} from '@anonworld/ui'
import { useNewCredential } from './context'
import { CredentialType, FungiblePosition } from '../../../types'
import { useAccount, useDisconnect } from 'wagmi'
import { formatAddress, zerionToChainId } from '../../../utils'
import { useWalletFungibles } from '../../../hooks/use-wallet-fungibles'
import { useEffect, useMemo, useState } from 'react'
import { useSDK } from '../../../providers'
import { parseUnits } from 'viem'

export function NewCredentialForm() {
  const { credentialType } = useNewCredential()
  if (credentialType === CredentialType.ERC20_BALANCE) {
    return <ERC20CredentialForm />
  }
  return <View />
}

function ERC20CredentialForm() {
  const { address } = useAccount()
  const [token, setToken] = useState<FungiblePosition>()
  const [balance, setBalance] = useState<number>(0)

  const handleSetToken = (token?: FungiblePosition) => {
    setToken(token)
    if (token) {
      setBalance(Math.floor(token.attributes.quantity.float / 2))
    }
  }

  return (
    <YStack gap="$2">
      <WalletField />
      {address && (
        <>
          <TokenField address={address} token={token} setToken={handleSetToken} />
          <BalanceField
            maxBalance={Number(token?.attributes.quantity.float.toFixed(2) ?? 0)}
            balance={balance}
            setBalance={setBalance}
          />
        </>
      )}
      <AddCredentialButton address={address} token={token} balance={balance} />
    </YStack>
  )
}

function WalletField() {
  const { address } = useAccount()
  const { connectWallet } = useNewCredential()
  const { disconnect } = useDisconnect()

  return (
    <YStack>
      <Label fos="$1" fow="400" color="$color11" textTransform="uppercase">
        Wallet
      </Label>
      <XStack
        ai="center"
        jc="space-between"
        bc="$borderColor"
        bw="$0.5"
        br="$4"
        py="$2.5"
        px="$3"
        theme="surface1"
        bg="$background"
      >
        <XStack gap="$2.5" ai="center" mx="$2">
          <Circle size={8} bg={address ? '$green11' : '$red11'} />
          <Text fos="$2" fow="400" color={address ? '$color12' : '$color11'}>
            {address ? formatAddress(address) : 'No wallet connected.'}
          </Text>
        </XStack>
        <Button
          size="$2.5"
          themeInverse
          bg="$background"
          br="$4"
          onPress={() => {
            if (address) {
              disconnect()
            } else {
              connectWallet?.()
            }
          }}
        >
          <Text fos="$2" fow="600">
            {address ? 'Disconnect' : 'Connect'}
          </Text>
        </Button>
      </XStack>
    </YStack>
  )
}

function TokenField({
  address,
  token,
  setToken,
}: {
  address: string
  token?: FungiblePosition
  setToken: (token?: FungiblePosition) => void
}) {
  const { data } = useWalletFungibles(address)

  const filteredData = useMemo(() => {
    return (
      data?.filter(
        (t) =>
          !t.attributes.fungible_info.implementations.some((i) => i.address === null) &&
          t.attributes.value
      ) ?? []
    )
  }, [data])

  useEffect(() => {
    if (filteredData.length > 0) {
      setToken(filteredData[0])
    }
  }, [filteredData])

  if (filteredData.length === 0) {
    return null
  }

  const selectedToken = token ?? filteredData[0]

  return (
    <YStack>
      <Label fos="$1" fow="400" color="$color11" textTransform="uppercase">
        Token
      </Label>
      <Select
        value={selectedToken.id}
        onValueChange={(value) => {
          const token = data?.find((t) => t.id === value)
          setToken(token)
        }}
        disablePreventBodyScroll
      >
        <Select.Trigger>
          <TokenValue token={selectedToken} />
        </Select.Trigger>

        <Adapt when="sm" platform="touch">
          <Sheet
            native
            modal
            dismissOnSnapToBottom
            animationConfig={{
              type: 'spring',
              damping: 20,
              mass: 1.2,
              stiffness: 250,
            }}
          >
            <Sheet.Frame>
              <Sheet.ScrollView>
                <Adapt.Contents />
              </Sheet.ScrollView>
            </Sheet.Frame>
            <Sheet.Overlay
              animation="lazy"
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
          </Sheet>
        </Adapt>

        <Select.Content zIndex={200000}>
          <Select.Viewport minWidth={200}>
            <Select.Group>
              <Select.Label>Select a token</Select.Label>
              {filteredData.map((token, index) => (
                <Select.Item key={token.id} index={index} value={token.id}>
                  <TokenValue token={token} />
                </Select.Item>
              ))}
            </Select.Group>
          </Select.Viewport>
        </Select.Content>
      </Select>
    </YStack>
  )
}

function TokenValue({ token }: { token: FungiblePosition }) {
  const impl = token.attributes.fungible_info.implementations.find(
    (impl) => impl.chain_id === token.relationships.chain.data.id
  )
  return (
    <XStack ai="center" jc="space-between" w="100%">
      <XStack gap="$2" ai="center">
        <Image src={token.attributes.fungible_info.icon?.url} width={24} height={24} />
        <YStack>
          <Text fos="$2" fow="500">
            {token.attributes.fungible_info.name}
          </Text>
          <Text fos="$1" fow="400" color="$color11">
            {formatAddress(impl?.address ?? '')}
          </Text>
        </YStack>
      </XStack>
      <XStack gap="$2" ai="center">
        <YStack ai="flex-end">
          <Text fos="$2" fow="500">
            {`${token.attributes.quantity.float.toLocaleString(undefined, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })} ${token.attributes.fungible_info.symbol}`}
          </Text>
          <Text fos="$1" fow="400" color="$color11">
            {`$${token.attributes.value?.toLocaleString(undefined, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })}`}
          </Text>
        </YStack>
      </XStack>
    </XStack>
  )
}

function BalanceField({
  maxBalance,
  balance,
  setBalance,
}: {
  maxBalance: number
  balance: number
  setBalance: (balance: number) => void
}) {
  return (
    <YStack>
      <Label fos="$1" fow="400" color="$color11" textTransform="uppercase">
        Balance
      </Label>
      <Slider
        value={[balance]}
        max={maxBalance}
        onValueChange={(value) => setBalance(value[0])}
      >
        <Slider.Track>
          <Slider.TrackActive bg="$color12" />
        </Slider.Track>
        <Slider.Thumb size="$1" index={0} circular />
      </Slider>
      <XStack jc="space-between" mt="$3" ai="center">
        <Input
          unstyled
          value={balance.toString()}
          onChangeText={(value) => setBalance(Number(value))}
          bc="$borderColor"
          bw="$0.5"
          br="$2"
          py="$1.5"
          px="$2"
          w="$12"
          theme="surface1"
          bg="$background"
        />
        <View
          onPress={() => setBalance(maxBalance)}
          cursor="pointer"
          opacity={0.75}
          hoverStyle={{ opacity: 1 }}
        >
          <Text fos="$2" fow="500">
            Max
          </Text>
        </View>
      </XStack>
    </YStack>
  )
}

function AddCredentialButton({
  address,
  token,
  balance,
}: { address?: string; token?: FungiblePosition; balance: number }) {
  const { setIsOpen } = useNewCredential()
  const { credentials } = useSDK()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>()

  const handleAddCredential = async () => {
    const impl = token?.attributes.fungible_info.implementations[0]
    if (!impl?.address) return
    const chainId = zerionToChainId[impl.chain_id]
    if (!chainId) return
    try {
      setIsLoading(true)
      await credentials.addERC20Balance({
        chainId: chainId,
        tokenAddress: impl.address as `0x${string}`,
        balanceSlot: 0,
        verifiedBalance: parseUnits(balance.toString(), impl.decimals),
      })
      setIsLoading(false)
      setIsOpen(false)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to add credential')
      setIsLoading(false)
    }
  }

  return (
    <YStack mt="$4" gap="$2">
      {error && (
        <Text color="$red11" textAlign="center" mt="$-2">
          {error}
        </Text>
      )}
      <Button
        themeInverse
        bg="$background"
        br="$4"
        disabled={!address || isLoading}
        disabledStyle={{ opacity: 0.5 }}
        hoverStyle={{ opacity: 0.9 }}
        onPress={handleAddCredential}
      >
        {!isLoading ? (
          <Text fos="$3" fow="600">
            {address ? 'Add Credential' : 'Connect Wallet'}
          </Text>
        ) : (
          <Spinner color="$color12" />
        )}
      </Button>
    </YStack>
  )
}
