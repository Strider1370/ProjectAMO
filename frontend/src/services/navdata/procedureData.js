const BASE = '/data/navdata/procedures'

const PROCEDURE_FILES = [
  { airport: 'RKSI', type: 'SID', file: 'rksi-sid-procedures.json' },
  { airport: 'RKSI', type: 'STAR', file: 'rksi-star-procedures.json' },
  { airport: 'RKSS', type: 'SID', file: 'rkss-sid-procedures.json' },
  { airport: 'RKSS', type: 'STAR', file: 'rkss-star-procedures.json' },
  { airport: 'RKPC', type: 'SID', file: 'rkpc-sid-procedures.json' },
  { airport: 'RKPC', type: 'STAR', file: 'rkpc-star-procedures.json' },
  { airport: 'RKPK', type: 'SID', file: 'rkpk-sid-procedures.json' },
  { airport: 'RKPK', type: 'STAR', file: 'rkpk-star-procedures.json' },
  { airport: 'RKJB', type: 'SID', file: 'rkjb-sid-procedures.json' },
  { airport: 'RKJB', type: 'STAR', file: 'rkjb-star-procedures.json' },
  { airport: 'RKNY', type: 'SID', file: 'rkny-sid-procedures.json' },
  { airport: 'RKNY', type: 'STAR', file: 'rkny-star-procedures.json' },
  { airport: 'RKJY', type: 'SID', file: 'rkjy-sid-procedures.json' },
  { airport: 'RKJY', type: 'STAR', file: 'rkjy-star-procedures.json' },
  { airport: 'RKPU', type: 'SID', file: 'rkpu-sid-procedures.json' },
  { airport: 'RKPU', type: 'STAR', file: 'rkpu-star-procedures.json' },
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
      enrouteFix: proc.enrouteFix ?? proc.endFix ?? null,
      startFix: proc.fixes?.[0]?.id ?? null,
      geometry: proc.geometry ?? null,
      displayPoints: (proc.displayPoints ?? []).map((p) => ({
        id: p.id,
        lat: p.coordinates?.lat ?? null,
        lon: p.coordinates?.lon ?? null,
      })),
      fixes: (proc.fixes ?? []).map((f) => ({
        id: f.id,
        lat: f.coordinates?.lat ?? null,
        lon: f.coordinates?.lon ?? null,
        legDistanceNm: f.legDistanceNm ?? null,
      })),
      label: `${proc.name} (RWY ${(proc.runways ?? []).join(', ')})`,
    }))
}

export const KNOWN_AIRPORTS = ['RKSI', 'RKSS', 'RKPC', 'RKPK', 'RKJB', 'RKNY', 'RKJY', 'RKPU']
