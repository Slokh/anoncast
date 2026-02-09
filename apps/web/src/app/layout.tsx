import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { WalletProvider } from '@/providers/wallet'
import { PrivacyWalletProvider } from '@/providers/privacy-wallet'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://anoncast.org'),
  title: 'anoncast',
  description: 'Post anonymously with ANON',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'anoncast',
    description: 'Post anonymously with ANON',
    images: ['/banner.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'anoncast',
    description: 'Post anonymously with ANON',
    images: ['/banner.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${GeistSans.className} antialiased`}>
        <WalletProvider>
          <PrivacyWalletProvider>{children}</PrivacyWalletProvider>
        </WalletProvider>
      </body>
    </html>
  )
}
