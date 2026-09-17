import http from 'node:http'

const IMMUTABLE = 'public, max-age=31536000, immutable'

const oldIndex = `<!doctype html>
<title>ProjectAMO old build</title>
<main>
  <h1>Old build index</h1>
  <button id="load-old-lazy">Load old lazy chunk</button>
  <output id="lazy-result"></output>
</main>
<script type="module">
  document.querySelector('#load-old-lazy').addEventListener('click', async () => {
    const lazy = await import('/assets/old-lazy.js')
    document.querySelector('#lazy-result').textContent = lazy.release
  })
</script>`

const newIndex = `<!doctype html>
<title>ProjectAMO new build</title>
<main>
  <h1>New build index</h1>
  <output id="new-entry-result"></output>
</main>
<script type="module" src="/assets/new-entry.js"></script>`

const oldAssets = new Map([
  ['/assets/old-lazy.js', 'export const release = "old lazy chunk from dist.previous"\n'],
])

const newAssets = new Map([
  ['/assets/new-entry.js', 'document.querySelector("#new-entry-result").textContent = "new entry from dist"\n'],
])

function send(response, status, body, contentType, cacheControl) {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
  })
  response.end(body)
}

// This fixture models only nginx's frontend rule: current dist is authoritative
// for index.html, while a current-miss immutable /assets/ request may use the
// immediately preceding dist.previous generation.  It deliberately has no
// fallback for index.html.
export async function createRf151FrontendRetentionFixture() {
  let current = { index: oldIndex, assets: oldAssets, release: 'old' }
  let previous = null
  const requests = []

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    const pathname = url.pathname

    if (pathname === '/' || pathname === '/index.html') {
      requests.push({ pathname, generation: current.release, source: 'current-index', status: 200 })
      send(response, 200, current.index, 'text/html; charset=utf-8', 'no-cache')
      return
    }

    if (pathname.startsWith('/assets/')) {
      const currentAsset = current.assets.get(pathname)
      if (currentAsset) {
        requests.push({ pathname, generation: current.release, source: 'current-asset', status: 200 })
        send(response, 200, currentAsset, 'application/javascript; charset=utf-8', IMMUTABLE)
        return
      }

      const previousAsset = previous?.assets.get(pathname)
      if (previousAsset) {
        requests.push({ pathname, generation: previous.release, source: 'previous-asset', status: 200 })
        send(response, 200, previousAsset, 'application/javascript; charset=utf-8', IMMUTABLE)
        return
      }
    }

    requests.push({ pathname, generation: null, source: 'missing', status: 404 })
    send(response, 404, 'not found\n', 'text/plain; charset=utf-8', 'no-cache')
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    throw new Error('RF-151 fixture did not receive a TCP address')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    deployNewBuild() {
      previous = current
      current = { index: newIndex, assets: newAssets, release: 'new' }
    },
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    },
  }
}
