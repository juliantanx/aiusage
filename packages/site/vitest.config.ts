import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '$lib': path.resolve('./src/lib'),
      '$env/dynamic/private': path.resolve('./tests/mocks/env.ts'),
      '@aiusage/core': path.resolve('../core/src/index.ts')
    }
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
})
