import { useQuery } from '@tanstack/react-query'
import { useSDK } from '../sdk'

export function usePosts({
  fid,
  type,
}: {
  fid: number
  type: 'new' | 'trending'
}) {
  const { sdk } = useSDK()
  return useQuery({
    queryKey: ['posts', fid, type],
    queryFn: async () => {
      const getFeed = type === 'new' ? sdk.getNewFeed : sdk.getTrendingFeed
      const response = await getFeed(fid)
      return response?.data?.data || []
    },
  })
}
