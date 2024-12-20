'use client'

import { Image, Text, View } from '@anonworld/ui'
import { HelpCircle, WalletMinimal } from '@tamagui/lucide-icons'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

enum Pathname {
  HOME = '/',
  ACCOUNTS = '/accounts',
  CREDENTIALS = '/credentials',
  ABOUT = '/about',
  NOT_FOUND = '/404',
}

export function Header() {
  const pathname = usePathname() as Pathname

  return (
    <View
      py="$3"
      px="$4"
      jc="space-between"
      ai="center"
      fd="row"
      borderBottomWidth="$0.5"
      borderColor="$borderColor"
    >
      <View fd="row" gap="$8" ai="center">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <View fd="row" gap="$2" ai="center">
            <Image src="/logo.png" alt="anon.world" width={32} height={32} />
            <Text fow="600" fos="$3">
              ANON.WORLD
            </Text>
          </View>
        </Link>
        <View fd="row" gap="$2" ai="center">
          <Link href="/" style={{ textDecoration: 'none' }}>
            <View
              bg="$background"
              py="$2"
              px="$3"
              br="$12"
              themeInverse={pathname === Pathname.HOME}
              hoverStyle={{ bg: '$color5' }}
            >
              <Text fow="500">Posts</Text>
            </View>
          </Link>
          <Link href="/accounts" style={{ textDecoration: 'none' }}>
            <View
              bg="$background"
              py="$2"
              px="$3"
              br="$12"
              themeInverse={pathname === Pathname.ACCOUNTS}
              hoverStyle={{ bg: '$color5' }}
            >
              <Text fow="500">Accounts</Text>
            </View>
          </Link>
        </View>
      </View>
      <View fd="row" gap="$3" ai="center">
        <Link
          href={pathname === Pathname.CREDENTIALS ? Pathname.HOME : Pathname.CREDENTIALS}
          style={{ textDecoration: 'none' }}
        >
          <View
            bg="$background"
            p="$2"
            br="$12"
            themeInverse={pathname === Pathname.CREDENTIALS}
            hoverStyle={{ bg: '$color5' }}
          >
            <WalletMinimal size={20} strokeWidth={2.5} />
          </View>
        </Link>
        <Link
          href={pathname === Pathname.ABOUT ? Pathname.HOME : Pathname.ABOUT}
          style={{ textDecoration: 'none' }}
        >
          <View
            bg="$background"
            p="$2"
            br="$12"
            themeInverse={pathname === Pathname.ABOUT}
            hoverStyle={{ bg: '$color5' }}
          >
            <HelpCircle size={20} strokeWidth={2.5} />
          </View>
        </Link>
      </View>
    </View>
  )
}
