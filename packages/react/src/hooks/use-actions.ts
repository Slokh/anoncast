import { useSDK } from '../providers/sdk'
import { useQuery } from '@tanstack/react-query'

export function useActions() {
  const { sdk } = useSDK()
  return useQuery({
    queryKey: ['actions'],
    queryFn: async () => {
      const data = await sdk.getActions()
      return data?.data?.data ?? []
    },
  })
}
