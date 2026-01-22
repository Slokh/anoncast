import { Header } from '@/components/header'
import { PostForm } from '@/components/auction/post-form'
import { AuctionTimer } from '@/components/auction/auction-timer'
import { PoolStats } from '@/components/pool-stats'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="mx-auto w-full max-w-lg space-y-4 px-4 py-4">
        <PostForm />
        <AuctionTimer />

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">How it works</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-start gap-3">
              <span className="font-mono text-primary">01</span>
              <p className="text-muted-foreground">Deposit <span className="text-foreground">$ANON</span> into your private balance</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-mono text-primary">02</span>
              <p className="text-muted-foreground">Write a post and place a bid</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-mono text-primary">03</span>
              <p className="text-muted-foreground"><span className="text-foreground">Highest bid</span> each hour gets posted</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-mono text-primary">04</span>
              <p className="text-muted-foreground">Previous winner <span className="text-foreground">earns the winning bid</span></p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground/60 border-t border-border pt-3">ZK proofs keep your balance, bids, and identity hidden.</p>
        </div>

        <PoolStats />
      </main>
    </div>
  )
}
