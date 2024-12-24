import { useQuery } from '@tanstack/react-query'
import { useSDK } from '../providers'

export function useToken({
  chainId,
  address,
}: {
  chainId: number
  address: `0x${string}`
}) {
  const { sdk } = useSDK()
  return useQuery({
    queryKey: ['token', chainId, address],
    queryFn: async () => {
      const response = await sdk.getFungible(chainId, address)
      return response.data ?? null
    },
  })
}
