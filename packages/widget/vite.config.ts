import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [svelte()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
})
