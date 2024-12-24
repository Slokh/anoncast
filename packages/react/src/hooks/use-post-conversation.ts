import { useQuery } from '@tanstack/react-query'
import { useSDK } from '../providers/sdk'

export function usePostConversation({ hash }: { hash: string }) {
  const { sdk } = useSDK()
  return useQuery({
    queryKey: ['post-conversation', hash],
    queryFn: async () => {
      const response = await sdk.getPostConversation(hash)
      return response.data?.data ?? null
    },
  })
}
