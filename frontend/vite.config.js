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
      // Frontend public/data/ serves aviation geojson — don't catch those here.
      // 끝의 슬래시가 중요하다: vite 프록시는 접두사 일치라, '/data/radar'로 두면
      // public/data/radar-coverage.geojson 같은 정적 파일까지 백엔드로 넘겨 404가 된다.
      '/data/radar/': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/data/satellite/': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/data/sigwx_low/': {
        target: backendTarget,
        changeOrigin: true,
      },
      },
    },
  }
})
