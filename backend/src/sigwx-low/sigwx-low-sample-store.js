import fs from 'fs'
import path from 'path'

export function buildSigwxLowSamplePaths(rootDir, tmfc) {
  const dir = path.join(rootDir, String(tmfc))
  return {
    dir,
    sourceXml: path.join(dir, 'source.xml'),
    parsedJson: path.join(dir, 'parsed.json'),
    targetPng: path.join(dir, 'target.png'),
    manifestJson: path.join(dir, 'manifest.json'),
  }
}

export function writeSigwxLowSampleManifest(rootDir, options) {
  const paths = buildSigwxLowSamplePaths(rootDir, options.tmfc)
  fs.mkdirSync(paths.dir, { recursive: true })
  const manifest = {
    tmfc: String(options.tmfc),
    level: 'low',
    imageUrl: options.imageUrl,
    targetImagePath: 'target.png',
    parsedJsonPath: 'parsed.json',
    sourceXmlPath: 'source.xml',
    imageStatus: options.imageStatus,
    parsedStatus: options.parsedStatus,
    xmlStatus: options.xmlStatus,
    captureMethod: options.captureMethod,
    capturedAt: options.capturedAt || new Date().toISOString(),
    notes: options.notes || '',
  }
  fs.writeFileSync(paths.manifestJson, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return paths.manifestJson
}
