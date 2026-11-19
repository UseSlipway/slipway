import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api/slipway': {
          target: env.SLIPWAY_API_URL || 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/slipway/, ''),
        },
      },
    },
  }
})
