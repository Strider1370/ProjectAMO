const BASE = '/data/navdata/procedures'

const PROCEDURE_FILES = [
  { airport: 'RKSI', type: 'SID', file: 'rksi-sid-procedures.json' },
  { airport: 'RKSI', type: 'STAR', file: 'rksi-star-procedures.json' },
  { airport: 'RKSS', type: 'SID', file: 'rkss-sid-procedures.json' },
  { airport: 'RKSS', type: 'STAR', file: 'rkss-star-procedures.json' },
  { airport: 'RKPC', type: 'SID', file: 'rkpc-sid-procedures.json' },
  { airport: 'RKPC', type: 'STAR', file: 'rkpc-star-procedures.json' },
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

  // Handle various JSON structures:
  // 1. Direct map: { ID: { ... }, ID2: { ... } }
  // 2. Wrapped map: { metadata: { ... }, starProcedures: { ID: { ... } } }
  let rawProcedures = data
  if (data.starProcedures) rawProcedures = data.starProcedures
  else if (data.sidProcedures) rawProcedures = data.sidProcedures

  return Object.entries(rawProcedures)
    .filter(([key]) => key !== 'metadata')
    .map(([id, proc]) => ({
      id: proc.id || id,
      name: proc.name,
      runways: proc.runways ?? [],
      enrouteFix: proc.enrouteFix ?? null,
      startFix: proc.fixes?.[0]?.id ?? null,
      geometry: proc.geometry ?? null,
      fixes: (proc.fixes ?? []).map((f) => ({ id: f.id, lat: f.coordinates?.lat ?? null, lon: f.coordinates?.lon ?? null })),
      label: `${proc.name} (RWY ${(proc.runways ?? []).join(', ')})`,
    }))
}

export const KNOWN_AIRPORTS = ['RKSI', 'RKSS', 'RKPC', 'RKPK', 'RKNW', 'RKNY', 'RKJJ', 'RKJK']
