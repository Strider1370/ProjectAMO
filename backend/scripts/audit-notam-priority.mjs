import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyOperationalNotam } from '../src/processors/notam-processor.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = path.join(root, 'backend/data/notam/latest.json')
const output = path.join(root, 'artifacts/notam-priority-audit/latest.json')
const snapshot = JSON.parse(fs.readFileSync(source, 'utf8'))
if (!Array.isArray(snapshot.items) || snapshot.items.length === 0) throw new Error('latest NOTAM snapshot is empty')
const rows = snapshot.items.map((item) => ({
  id: item.id, location: item.location, qcode: item.qcode,
  summary: item.summary, raw_text: item.rawText || '', schedule_text: item.schedule_text || null,
  operational: item.operational || classifyOperationalNotam(item.qcode, item.summary),
}))
if (rows.length !== snapshot.items.length || rows.some(({ operational }) => !['critical', 'warning', 'info', 'unclassified'].includes(operational.priority))) throw new Error('NOTAM audit classification failed')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ fetched_at: snapshot.fetched_at, total: rows.length, rows }, null, 2) + '\n')
const counts = Object.groupBy(rows, ({ operational }) => operational.priority)
console.log(JSON.stringify({ total: rows.length, counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value.length])), output }, null, 2))
