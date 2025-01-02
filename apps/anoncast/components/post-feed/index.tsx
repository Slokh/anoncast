'use client'

import { FarcasterCast, useTrendingPosts, useNewPosts } from '@anonworld/react'
import { useState } from 'react'
import AnimatedTabs from './animated-tabs'
import { Skeleton } from '../ui/skeleton'
import { PostDisplay } from '../post'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BEST_OF_FID, LAUNCH_FID } from '@/lib/utils'

export function PostFeed({
  defaultTab = 'trending',
}: {
  defaultTab?: 'new' | 'trending'
}) {
  const [selected, setSelected] = useState<'new' | 'trending'>(defaultTab)
  const router = useRouter()

  const { data: trendingPosts, isLoading: isTrendingLoading } = useTrendingPosts({
    fid: BEST_OF_FID,
  })

  const { data: newPosts, isLoading: isNewLoading } = useNewPosts({
    fid: BEST_OF_FID,
    filter: ({ text }) => !text.match(/.*@clanker.*(launch|deploy|make).*/is),
  })

  return (
    <div className="flex flex-col gap-4 ">
      <div className="flex flex-row justify-between">
        <AnimatedTabs
          tabs={['trending', 'new']}
          activeTab={selected}
          onTabChange={(tab) => {
            setSelected(tab as 'new' | 'trending')
            router.push(tab === 'new' ? '/anoncast/new' : '/')
          }}
          layoutId="feed-tabs"
        />
      </div>
      {selected === 'new' ? (
        isNewLoading ? (
          <SkeletonPosts />
        ) : newPosts?.pages[0]?.length && newPosts?.pages[0]?.length > 0 ? (
          <Posts casts={newPosts?.pages[0]} />
        ) : (
          <h1>Something went wrong. Please refresh the page.</h1>
        )
      ) : isTrendingLoading ? (
        <SkeletonPosts />
      ) : trendingPosts?.length && trendingPosts?.length > 0 ? (
        <Posts casts={trendingPosts} />
      ) : (
        <h1>Something went wrong. Please refresh the page.</h1>
      )}
    </div>
  )
}

export function PromotedFeed({
  defaultTab = 'promoted',
}: {
  defaultTab?: 'new' | 'promoted'
}) {
  const [selected, setSelected] = useState<'new' | 'promoted'>(defaultTab)
  const router = useRouter()
  const { data: promotedLaunches, isLoading: isPromotedLoading } = useNewPosts({
    fid: LAUNCH_FID,
  })

  const { data: newLaunches, isLoading: isNewLoading } = useNewPosts({
    fid: BEST_OF_FID,
    filter: ({ text }) =>
      !!text.toLowerCase().match(/.*@clanker.*(launch|deploy|make).*/is),
  })

  return (
    <div className="flex flex-col gap-4 ">
      <div className="flex flex-row justify-between">
        <AnimatedTabs
          tabs={['promoted', 'new']}
          activeTab={selected}
          onTabChange={(tab) => {
            setSelected(tab as 'new' | 'promoted')
            router.push(tab === 'new' ? '/anonfun/new' : '/anonfun')
          }}
          layoutId="launch-tabs"
        />
      </div>
      {selected === 'new' ? (
        isNewLoading ? (
          <SkeletonPosts />
        ) : newLaunches?.pages[0]?.length && newLaunches?.pages[0]?.length > 0 ? (
          <Posts casts={newLaunches?.pages[0]} />
        ) : (
          <h1>Something went wrong. Please refresh the page.</h1>
        )
      ) : isPromotedLoading ? (
        <SkeletonPosts />
      ) : promotedLaunches?.pages[0]?.length && promotedLaunches?.pages[0]?.length > 0 ? (
        <Posts casts={promotedLaunches?.pages[0]} />
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
}: {
  casts?: FarcasterCast[]
}) {
  return (
    <div className="flex flex-col gap-4">
      {casts?.map((cast) => (
        <Link href={`/posts/${cast.hash}`} key={cast.hash}>
          <PostDisplay cast={cast} />
        </Link>
      ))}
    </div>
  )
}
