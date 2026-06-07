import adapter from '@sveltejs/adapter-node'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      out: 'build'
    }),
    bodySizeLimit: '50m'
  }
}

export default config
