import { config } from '@anonworld/ui'

export type Conf = typeof config

declare module '@anonworld/ui' {
  interface TamaguiCustomConfig extends Conf {}
}
