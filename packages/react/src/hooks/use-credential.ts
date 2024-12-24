import { useQuery } from '@tanstack/react-query'

import { useSDK } from '../providers'

export function useCredential({ id, enabled }: { id: string; enabled?: boolean }) {
  const { sdk } = useSDK()
  return useQuery({
    queryKey: ['credential', id],
    queryFn: async () => {
      const credential = await sdk.getCredential(id)
      return credential?.data ?? null
    },
    enabled,
  })
}
