import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '')
  const backendTarget = env.PROJECTAMO_BACKEND_TARGET || 'http://localhost:3001'
  return {
    plugins: [react()],
    envDir: '..', // .env is at project root, not inside frontend/
    resolve: { dedupe: ['react', 'react-dom'] },
    server: {
      proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      // Backend-generated data (radar, satellite, sigwx images)
      // Frontend public/data/ serves aviation geojson — don't catch those here
      '/data/radar': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/data/satellite': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/data/sigwx_low': {
        target: backendTarget,
        changeOrigin: true,
      },
      },
    },
  }
})
