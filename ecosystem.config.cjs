module.exports = {
  apps: [
    {
      name: 'projectamo-backend',
      cwd: '/opt/projectamo/current',
      script: 'backend/server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        // IPv6를 먼저 시도하지 않는다. 이 서버에는 IPv6 주소가 붙어 있고, 외부 기상 API 중
        // aviationweather.gov(NOAA)와 api.rainviewer.com은 진짜 IPv6 주소를 갖고 있다.
        // 기본 동작(Happy Eyeballs)은 IPv6를 먼저 시도하는데, 밖으로 나가는 IPv6 경로가
        // 막혀 있으면 매번 타임아웃을 기다렸다가 IPv4로 넘어가 해외 기상·강수 레이더 수집이
        // 느려지거나 실패한다. 2026-07-15에 운영 서버에 직접 넣은 뒤 오류가 멎었는데
        // 커밋되지 않아 저장소에는 없었다 — 서버를 새로 만들면 조용히 사라질 설정이었다.
        NODE_OPTIONS: '--no-network-family-autoselection',
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: 3001,
        DATA_PATH: '/opt/projectamo/shared/data',
      },
    },
  ],
}
