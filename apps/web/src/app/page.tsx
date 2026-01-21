import { Header } from '@/components/header'
import { AuctionTimer } from '@/components/auction/auction-timer'
import { AuctionBidder } from '@/components/auction/auction-bidder'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="mx-auto w-full max-w-lg px-4 py-8">
        <div className="space-y-4">
          <AuctionTimer />
          <AuctionBidder />
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">How it works</h2>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-mono text-primary">1.</span>
              <span>Deposit $ANON into the privacy pool</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-primary">2.</span>
              <span>Place bids with your post—completely anonymous</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-primary">3.</span>
              <span>Highest bid at XX:00 wins the slot</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-primary">4.</span>
              <span>Winner&apos;s post published to Farcaster &amp; X</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-primary">5.</span>
              <span>100% of bid goes to previous winner</span>
            </li>
          </ul>

          <div className="mt-4 flex gap-4 text-sm">
            <a
              href="https://x.com/anoncast_"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              X
            </a>
            <a
              href="https://warpcast.com/anoncast"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              Farcaster
            </a>
            <a
              href="https://github.com/Slokh/anoncast"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              Github
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
