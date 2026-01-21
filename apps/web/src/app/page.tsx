import { Header } from '@/components/header'
import { PostForm } from '@/components/auction/post-form'
import { AuctionTimer } from '@/components/auction/auction-timer'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="mx-auto w-full max-w-lg space-y-4 px-4 py-4">
        <PostForm />
        <AuctionTimer />

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">How it works</h2>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>1. Deposit $ANON into the privacy pool</li>
            <li>2. Write your post and place a bid</li>
            <li>3. Highest bid at the top of the hour wins</li>
            <li>4. Winning post is published to Farcaster & X</li>
          </ol>

          <div className="mt-4 flex gap-4 border-t border-border pt-4 text-sm">
            <a
              href="https://x.com/anoncast_"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              X
            </a>
            <a
              href="https://warpcast.com/anoncast"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              Farcaster
            </a>
            <a
              href="https://github.com/Slokh/anoncast"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              Github
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
