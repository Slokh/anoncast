import { Cast } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import AnimatedTabs from './animated-tabs'
import { Skeleton } from '../ui/skeleton'
import { Post } from '../post'
import Link from 'next/link'

export default function PostFeed({
  tokenAddress,
  defaultTab = 'trending',
}: {
  tokenAddress: string
  defaultTab?: 'new' | 'trending'
}) {
  const [selected, setSelected] = useState<'new' | 'trending'>(defaultTab)

  const { data: trendingPosts, isLoading: isTrendingLoading } = useQuery({
    queryKey: ['trending', tokenAddress],
    queryFn: async (): Promise<Cast[]> => {
      const response = await api.getTrendingPosts(tokenAddress)
      return response?.casts || []
    },
  })

  const { data: newPosts, isLoading: isNewLoading } = useQuery({
    queryKey: ['posts', tokenAddress],
    queryFn: async (): Promise<Cast[]> => {
      const response = await api.getNewPosts(tokenAddress)
      return response?.casts || []
    },
  })

  return (
    <div className="flex flex-col gap-4 ">
      <div className="flex flex-row justify-between">
        <AnimatedTabs
          tabs={['trending', 'new']}
          activeTab={selected}
          onTabChange={(tab) => setSelected(tab as 'new' | 'trending')}
          layoutId="feed-tabs"
        />
      </div>
      {selected === 'new' ? (
        isNewLoading ? (
          <SkeletonPosts />
        ) : newPosts?.length && newPosts?.length > 0 ? (
          <Posts casts={newPosts} tokenAddress={tokenAddress} />
        ) : (
          <h1>Something went wrong. Please refresh the page.</h1>
        )
      ) : isTrendingLoading ? (
        <SkeletonPosts />
      ) : trendingPosts?.length && trendingPosts?.length > 0 ? (
        <Posts casts={trendingPosts} tokenAddress={tokenAddress} />
      ) : (
        <h1>Something went wrong. Please refresh the page.</h1>
      )}
    </div>
  )
}

function SkeletonPosts() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonPost />
      <SkeletonPost />
      <SkeletonPost />
      <SkeletonPost />
    </div>
  )
}

function SkeletonPost() {
  return (
    <div className="relative [overflow-wrap:anywhere] bg-[#111111] rounded-xl overflow-hidden">
      <div className="flex flex-col gap-4 border p-4 sm:p-6 rounded-xl">
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>

        <Skeleton className="h-4 w-[100px]" />
      </div>
    </div>
  )
}

function Posts({
  casts,
  tokenAddress,
}: {
  casts?: Cast[]
  tokenAddress: string
}) {
  return (
    <div className="flex flex-col gap-4">
      {casts?.map((cast) => (
        <Link href={`/posts/${cast.hash}`} key={cast.hash}>
          <Post cast={cast} tokenAddress={tokenAddress} />
        </Link>
      ))}
    </div>
  )
}
