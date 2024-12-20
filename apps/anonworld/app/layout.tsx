import type { Metadata } from 'next'
import { NextTamaguiProvider } from './NextTamaguiProvider'
import { Header } from '@/components/header'
import { GeistSans } from 'geist/font/sans'

export const metadata: Metadata = {
  title: 'anon.world',
  description: 'anon.world',
  icons: '/favicon.ico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={GeistSans.className}>
        <NextTamaguiProvider>
          <Header />
          {children}
        </NextTamaguiProvider>
      </body>
    </html>
  )
}
