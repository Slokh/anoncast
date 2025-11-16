import { useCreatePost } from './create-post/context'
import AnimatedTabs from './post-feed/animated-tabs'

export function NavTabs() {
  const { variant, setVariant } = useCreatePost()
  return (
    <AnimatedTabs
      tabs={['anoncast', 'anonfun', 'anonpub', { id: 'anon', label: '$ANON', badge: 'NEW' }]}
      activeTab={variant}
      onTabChange={(tab) => setVariant(tab as 'anoncast' | 'anonfun' | 'anon' | 'anonpub')}
      layoutId="main-tabs"
    />
  )
}
