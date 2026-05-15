import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  noExternal: ['@aiusage/core'],
  esbuildOptions(options) {
    options.define = {
      ...options.define,
      __VERSION__: JSON.stringify(pkg.version),
    }
  },
})
