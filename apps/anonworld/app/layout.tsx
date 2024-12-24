import type { Metadata } from 'next'
import { Header } from '@/components/header'
import { GeistSans } from 'geist/font/sans'
import { Providers } from '@/components/providers'

export const metadata: Metadata = {
  title: 'anon.world',
  description: 'anon.world',
  icons: '/favicon.ico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={GeistSans.className}>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  )
}
