module.exports = {
  apps: [
    {
      name: 'projectamo-backend',
      cwd: '/opt/projectamo/current',
      script: 'backend/server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: 3001,
        DATA_PATH: '/opt/projectamo/shared/data',
      },
    },
  ],
}
