import { useQuery } from '@tanstack/react-query'
import { useSDK } from '../providers'

export function useWalletFungibles(address: string) {
  const { sdk } = useSDK()
  return useQuery({
    queryKey: ['wallet-fungibles', address],
    queryFn: async () => {
      const data = await sdk.getWalletFungibles(address)
      return data.data?.data ?? []
    },
  })
}
