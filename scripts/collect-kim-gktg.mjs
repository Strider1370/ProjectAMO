import { parseArgs } from 'node:util'
import { process as collect } from '../backend/src/processors/kim-gktg-processor.js'
const { values } = parseArgs({ options: { tmfc: { type: 'string' }, hours: { type: 'string' } } })
// The scheduler and ADMIN always use F000–F012. Explicit --hours is for offline validation.
const options = {}
if (values.tmfc) options.tmfc = values.tmfc
if (values.hours) options.forecastHours = values.hours.split(',').map(Number)
const result = await collect(options)
console.log(JSON.stringify(result, null, 2))
if (!result.saved) process.exitCode = 1
