'use client'

import { Cast, usePosts } from '../../../../packages/react/src'
import { useState } from 'react'
import AnimatedTabs from './animated-tabs'
import { Skeleton } from '../ui/skeleton'
import { Post } from '../post'
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

  const { data: trendingPosts, isLoading: isTrendingLoading } = usePosts({
    fid: BEST_OF_FID,
    type: 'trending',
  })

  const { data: newPosts, isLoading: isNewLoading } = usePosts({
    fid: BEST_OF_FID,
    type: 'new',
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
        ) : newPosts?.length && newPosts?.length > 0 ? (
          <Posts casts={newPosts} />
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
  const { data: promotedLaunches, isLoading: isPromotedLoading } = usePosts({
    fid: LAUNCH_FID,
    type: 'new',
  })

  const { data: newLaunches, isLoading: isNewLoading } = usePosts({
    fid: BEST_OF_FID,
    type: 'new',
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
        ) : newLaunches?.length && newLaunches?.length > 0 ? (
          <Posts casts={newLaunches} />
        ) : (
          <h1>Something went wrong. Please refresh the page.</h1>
        )
      ) : isPromotedLoading ? (
        <SkeletonPosts />
      ) : promotedLaunches?.length && promotedLaunches?.length > 0 ? (
        <Posts casts={promotedLaunches} />
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
  casts?: Cast[]
}) {
  return (
    <div className="flex flex-col gap-4">
      {casts?.map((cast) => (
        <Link href={`/posts/${cast.hash}`} key={cast.hash}>
          <Post cast={cast} />
        </Link>
      ))}
    </div>
  )
}
