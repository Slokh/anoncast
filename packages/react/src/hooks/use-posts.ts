import { useQuery } from '@tanstack/react-query'
import { useSDK } from '../providers/sdk'
import { Cast } from '../types'

export function usePosts({
  fid,
  type,
  filter,
}: {
  fid: number
  type: 'new' | 'trending'
  filter?: (cast: Cast) => boolean
}) {
  const { sdk } = useSDK()
  return useQuery({
    queryKey: ['posts', fid, type],
    queryFn: async () => {
      const response =
        type === 'new' ? await sdk.getNewFeed(fid) : await sdk.getTrendingFeed(fid)
      const posts = response?.data?.data || []
      if (filter) {
        return posts.filter(filter)
      }
      return posts
    },
  })
}
