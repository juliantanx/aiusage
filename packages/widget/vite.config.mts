import { defineConfig } from 'vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [svelte({ preprocess: vitePreprocess() })],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
})
