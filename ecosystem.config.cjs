module.exports = {
  apps: [
    {
      name: 'projectamo-backend',
      cwd: '/opt/projectamo/current',
      script: 'backend/server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        // 백엔드가 쓸 수 있는 힙 상한. 서버 메모리가 1.9GB뿐이라 백엔드 하나가 다 먹으면
        // 프론트엔드 빌드도, OS도 버티지 못한다. 운영에서 실제로 이 값으로 돌고 있었는데
        // 저장소에는 없어서, 서버를 새로 만들면 조용히 사라질 설정이었다(2026-08-19에 발견).
        NODE_OPTIONS: '--max-old-space-size=1400',
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: 3001,
        DATA_PATH: '/opt/projectamo/shared/data',
      },
    },
  ],
}
