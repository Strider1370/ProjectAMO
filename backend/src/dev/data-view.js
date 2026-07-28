import fs from 'node:fs'
import path from 'node:path'

import config from '../config.js'

const SNAPSHOT_NAME = /^[a-zA-Z0-9_-]+$/
const LIVE_PASSTHROUGH = Object.freeze(['typhoon', 'terrain'])

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function replaceSymlink(activePath, targetPath) {
  const parent = path.dirname(activePath)
  fs.mkdirSync(parent, { recursive: true })
  const next = `${activePath}.next-${process.pid}-${Date.now()}`
  fs.rmSync(next, { recursive: true, force: true })
  try {
    fs.symlinkSync(path.relative(parent, targetPath) || '.', next, 'dir')
    if (fs.existsSync(activePath) && !fs.lstatSync(activePath).isSymbolicLink()) {
      throw new Error('active_data_path_not_symlink')
    }
    fs.renameSync(next, activePath)
  } finally {
    fs.rmSync(next, { recursive: true, force: true })
  }
}

function publishDirectory(stage, destination) {
  const prior = `${destination}.prior-${process.pid}-${Date.now()}`
  if (fs.existsSync(destination)) fs.renameSync(destination, prior)
  try {
    fs.renameSync(stage, destination)
    fs.rmSync(prior, { recursive: true, force: true })
  } catch (error) {
    if (!fs.existsSync(destination) && fs.existsSync(prior)) fs.renameSync(prior, destination)
    throw error
  }
}

export function createDataViewManager({
  basePath = config.storage.base_path,
  activePath = config.storage.active_path,
  passthrough = LIVE_PASSTHROUGH,
} = {}) {
  const viewsPath = path.join(basePath, '.demo-views')

  function contextFromPointer() {
    if (!fs.existsSync(activePath)) return null
    const resolved = fs.realpathSync(activePath)
    const liveResolved = fs.realpathSync(basePath)
    if (resolved === liveResolved) {
      return {
        mode: 'live',
        name: null,
        root: activePath,
        referenceTime: null,
        revision: 'live',
      }
    }
    const meta = readJson(path.join(resolved, '.view.json'))
    if (!meta || meta.mode !== 'demo' || !meta.name || !meta.referenceTime) {
      throw new Error('active_data_view_invalid')
    }
    return { ...meta, root: activePath }
  }

  function ensure() {
    fs.mkdirSync(basePath, { recursive: true })
    const current = contextFromPointer()
    if (current) return current
    replaceSymlink(activePath, basePath)
    return contextFromPointer()
  }

  function current() {
    return ensure()
  }

  function activateDemo(name) {
    if (!SNAPSHOT_NAME.test(String(name || ''))) throw new Error('invalid_snapshot_name')
    const existing = current()
    if (existing.mode === 'demo' && existing.name === name) return existing

    const snapshotPath = path.join(basePath, 'snapshots', name)
    const snapshotResolved = fs.existsSync(snapshotPath) ? fs.realpathSync(snapshotPath) : null
    const snapshotsResolved = fs.existsSync(path.join(basePath, 'snapshots'))
      ? fs.realpathSync(path.join(basePath, 'snapshots'))
      : null
    if (!snapshotResolved || !snapshotsResolved
      || (snapshotResolved !== snapshotsResolved && !snapshotResolved.startsWith(`${snapshotsResolved}${path.sep}`))) {
      throw new Error('snapshot_not_found')
    }
    const snapshotMeta = readJson(path.join(snapshotResolved, 'meta.json'))
    const referenceTime = snapshotMeta?.referenceTime
    if (!Number.isFinite(Date.parse(referenceTime))) throw new Error('snapshot_reference_time_missing')

    fs.mkdirSync(viewsPath, { recursive: true })
    const destination = path.join(viewsPath, name)
    const stage = `${destination}.stage-${process.pid}-${Date.now()}`
    fs.rmSync(stage, { recursive: true, force: true })
    fs.mkdirSync(stage, { recursive: true })
    try {
      for (const entry of fs.readdirSync(snapshotResolved, { withFileTypes: true })) {
        if (!entry.isDirectory() || passthrough.includes(entry.name)) continue
        const target = path.join(snapshotResolved, entry.name)
        fs.symlinkSync(path.relative(stage, target), path.join(stage, entry.name), 'dir')
      }
      for (const type of passthrough) {
        const target = path.join(basePath, type)
        if (fs.existsSync(target)) fs.symlinkSync(path.relative(stage, target), path.join(stage, type), 'dir')
      }
      const meta = {
        mode: 'demo',
        name,
        referenceTime: new Date(referenceTime).toISOString(),
        revision: `demo:${name}:${new Date(referenceTime).toISOString()}`,
      }
      fs.writeFileSync(path.join(stage, '.view.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
      publishDirectory(stage, destination)
      replaceSymlink(activePath, destination)
      return contextFromPointer()
    } finally {
      fs.rmSync(stage, { recursive: true, force: true })
    }
  }

  function activateLive() {
    const existing = current()
    if (existing.mode === 'live') return existing
    replaceSymlink(activePath, basePath)
    return contextFromPointer()
  }

  return { activePath, basePath, activateDemo, activateLive, current, ensure }
}

export const dataView = createDataViewManager()

export function ensureActiveDataView() {
  return dataView.ensure()
}

export function getActiveDataContext() {
  return dataView.current()
}

export function activateDemoView(name) {
  return dataView.activateDemo(name)
}

export function activateLiveView() {
  return dataView.activateLive()
}

export function isLiveViewActive() {
  return getActiveDataContext().mode === 'live'
}

export default dataView
