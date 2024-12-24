const CopyPlugin = require('copy-webpack-plugin')
const { withTamagui } = require('@tamagui/next-plugin')
const webpack = require('webpack')

const plugins = [
  withTamagui({
    config: '../../packages/ui/src/config/tamagui.config.ts',
    components: ['tamagui', '@anonworld/ui'],
    appDir: true,
    outputCSS: process.env.NODE_ENV === 'production' ? './public/tamagui.css' : null,
    disableExtraction: process.env.NODE_ENV === 'development',
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

module.exports = nextConfig
