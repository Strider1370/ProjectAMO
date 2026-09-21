import { parentPort, workerData } from 'node:worker_threads'
import { parseOrganizationMapMaterial } from './organization-kml.js'
try { parentPort.postMessage({ result: parseOrganizationMapMaterial(Buffer.from(workerData.bytes),workerData.mimeType) }) }
catch(error) { parentPort.postMessage({ error: String(error.message).slice(0,200) }) }
