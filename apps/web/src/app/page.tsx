import { Header } from '@/components/header'
import { HolderRequirements } from '@/components/holder-requirements'
import { PostComposer } from '@/components/post/composer'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="mx-auto w-full max-w-lg px-4 py-8">
        <PostComposer />

        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Post anonymously</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Posts are made anonymous using zk proofs. Due to the complex calculations
            required, it could take up to a few minutes. Do not post porn, doxes, shills,
            or threats. This is not about censorship resistance - it&apos;s about great
            anonymous posts.
          </p>

          <HolderRequirements />

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
