import { Shield } from 'lucide-react'
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
          <h2 className="text-sm font-semibold">How it works</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-baseline gap-3">
              <span className="w-5 shrink-0 font-mono text-xs text-primary">01</span>
              <p className="text-muted-foreground">Deposit <span className="text-foreground">ANON</span> into your private balance</p>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="w-5 shrink-0 font-mono text-xs text-primary">02</span>
              <p className="text-muted-foreground">Write a post and place a bid</p>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="w-5 shrink-0 font-mono text-xs text-primary">03</span>
              <p className="text-muted-foreground"><span className="text-foreground">Highest bid</span> each hour gets posted</p>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="w-5 shrink-0 font-mono text-xs text-primary">04</span>
              <p className="text-muted-foreground">Previous winner <span className="text-foreground">earns the winning bid</span></p>
            </div>
          </div>
          <div className="-mx-4 mt-3 flex items-center gap-2 border-t border-border/50 px-4 pt-3 text-xs text-muted-foreground">
            <Shield className="h-3 w-3 text-green-500" />
            <span>ZK proofs keep your balance, bids, and identity hidden.</span>
          </div>
        </div>

{/* <PoolStats /> */}
      </main>
    </div>
  )
}
