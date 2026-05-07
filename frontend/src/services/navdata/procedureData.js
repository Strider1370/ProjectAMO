const BASE = '/data/navdata/procedures'

const PROCEDURE_FILES = [
  { airport: 'RKSI', type: 'SID',  file: 'rksi-sid-procedures.json' },
  { airport: 'RKSI', type: 'STAR', file: 'rksi-star-procedures.json' },
  { airport: 'RKSS', type: 'SID',  file: 'rkss-sid-procedures.json' },
  { airport: 'RKPC', type: 'SID',  file: 'rkpc-sid-procedures.json' },
]

const cache = {}

async function loadFile(file) {
  if (cache[file]) return cache[file]
  const res = await fetch(`${BASE}/${file}`)
  const data = await res.json()
  cache[file] = data
  return data
}

export async function getProcedures(airport, type) {
  const entry = PROCEDURE_FILES.find((e) => e.airport === airport && e.type === type)
  if (!entry) return []
  const data = await loadFile(entry.file)
  return Object.values(data).map((proc) => ({
    id:          proc.id,
    name:        proc.name,
    runways:     proc.runways ?? [],
    enrouteFix:  proc.enrouteFix ?? null,
    startFix:    proc.fixes?.[0]?.id ?? null,
    geometry:    proc.geometry ?? null,
    fixes:       (proc.fixes ?? []).map((f) => ({ id: f.id, lat: f.coordinates?.lat ?? null, lon: f.coordinates?.lon ?? null })),
    label:       `${proc.name} (RWY ${(proc.runways ?? []).join(', ')})`,
  }))
}

export const KNOWN_AIRPORTS = ['RKSI', 'RKSS', 'RKPC', 'RKPK', 'RKNW', 'RKNY', 'RKJJ', 'RKJK']
