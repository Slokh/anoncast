import webpack from 'webpack'
import CopyPlugin from 'copy-webpack-plugin'
import { withTamagui } from '@tamagui/next-plugin'
import { join } from 'node:path'

const boolVals = {
  true: true,
  false: false,
}

const disableExtraction =
  boolVals[process.env.DISABLE_EXTRACTION] ?? process.env.NODE_ENV === 'development'

const plugins = [
  withTamagui({
    config: '../../packages/ui/src/config/tamagui.config.ts',
    components: ['tamagui', '@anonworld/ui'],
    appDir: true,
    importsWhitelist: ['constants.js', 'colors.js'],
    outputCSS: process.env.NODE_ENV === 'production' ? './public/tamagui.css' : null,
    logTimings: true,
    disableExtraction,
    shouldExtract: (path) => {
      if (path.includes(join('packages', 'app'))) {
        return true
      }
    },
    excludeReactNativeWebExports: [
      'Switch',
      'ProgressBar',
      'Picker',
      'CheckBox',
      'Touchable',
    ],
  }),
]

/** @type {import('next').NextConfig} */
let nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/': [
        './node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/**/*',
        './node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/barretenberg_wasm_thread/factory/node/thread.worker.js',
      ],
    },
    scrollRestoration: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  modularizeImports: {
    '@tamagui/lucide-icons': {
      transform: `@tamagui/lucide-icons/dist/esm/icons/{{kebabCase member}}`,
      skipDefaultConversion: true,
    },
  },
  transpilePackages: [
    'solito',
    'react-native-web',
    'expo-linking',
    'expo-constants',
    'expo-modules-core',
  ],
  webpack: (config) => {
    config.experiments = {
      asyncWebAssembly: true,
      syncWebAssembly: true,
      layers: true,
    }

    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '')
      })
    )

    config.plugins.push(
      new CopyPlugin({
        patterns: [
          {
            from: '../../node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/barretenberg-threads.wasm',
            to: '.',
          },
        ],
      })
    )

    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve.alias,
        'react-native-svg': '@tamagui/react-native-svg',
      },
    }

    return config
  },
}

for (const plugin of plugins) {
  nextConfig = {
    ...nextConfig,
    ...plugin(nextConfig),
  }
}

export default nextConfig
