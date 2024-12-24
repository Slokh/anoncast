import { config as configBase } from '@tamagui/config/v3'
import { createTamagui, createFont } from 'tamagui'
import { themes } from './themes'

const geist = createFont({
  family: '__GeistSans_3a0388',
  size: {
    1: 12,
    2: 14,
    3: 16,
    4: 20,
    5: 24,
    6: 32,
    7: 48,
    8: 64,
  },
})

export const config = createTamagui({
  ...configBase,
  fonts: {
    ...configBase.fonts,
    heading: geist,
    body: geist,
    mono: geist,
  },
  themes: themes,
})

export default config

export type Conf = typeof config

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
