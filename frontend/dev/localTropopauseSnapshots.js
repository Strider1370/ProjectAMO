import fs from 'node:fs'
import path from 'node:path'

// 로컬 비교에 필요한 공개 운영 필드 사본만 제공한다. configureServer는 운영 빌드에 포함되지 않는다.
export function localTropopauseSnapshots() {
  const root = path.resolve(import.meta.dirname, '../../artifacts/tropopause-comparison/data')
  return { name: 'local-tropopause-snapshots', configureServer(server) {
    server.middlewares.use('/__local_tropopause', (req, res, next) => {
      const name = (req.url ?? '').split('?')[0].replace(/^\//, '')
      if (!/^(?:index|(?:ea|kr)-\d{10}-f\d{1,3}-[a-f0-9]+)\.json$/.test(name)) return next()
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end() }
      const file = path.join(root, name)
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Run node scripts/capture-tropopause-comparison.mjs first') }
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Length', fs.statSync(file).size)
      if (req.method === 'HEAD') return res.end()
      const stream = fs.createReadStream(file)
      stream.on('error', error => res.destroy(error))
      stream.pipe(res)
    })
  } }
}
