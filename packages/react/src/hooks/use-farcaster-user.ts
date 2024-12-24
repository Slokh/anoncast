import { useQuery } from '@tanstack/react-query'
import { useSDK } from '../providers/sdk'

export function useFarcasterUser(fid: string) {
  const { sdk } = useSDK()
  return useQuery({
    queryKey: ['farcaster-user', fid],
    queryFn: async () => {
      const user = await sdk.getFarcasterUser(Number(fid))
      return user?.data ?? null
    },
  })
}
