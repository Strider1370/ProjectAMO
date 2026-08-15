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
  { airport: 'RKTH', type: 'SID', file: 'rkth-sid-procedures.json' },
  { airport: 'RKTH', type: 'STAR', file: 'rkth-star-procedures.json' },
  { airport: 'RKTU', type: 'SID', file: 'rktu-sid-procedures.json' },
  { airport: 'RKTU', type: 'STAR', file: 'rktu-star-procedures.json' },
  { airport: 'RKNW', type: 'SID', file: 'rknw-sid-procedures.json' },
  { airport: 'RKNW', type: 'STAR', file: 'rknw-star-procedures.json' },
  { airport: 'RKPS', type: 'SID', file: 'rkps-sid-procedures.json' },
  { airport: 'RKPS', type: 'STAR', file: 'rkps-star-procedures.json' },
  { airport: 'RKJJ', type: 'SID', file: 'rkjj-sid-procedures.json' },
  { airport: 'RKJJ', type: 'STAR', file: 'rkjj-star-procedures.json' },
  { airport: 'RKJK', type: 'SID', file: 'rkjk-sid-procedures.json' },
  { airport: 'RKJK', type: 'STAR', file: 'rkjk-star-procedures.json' },
]

// 받은 뒤에만 저장하면, 같은 파일을 동시에 두 번 부를 때 둘 다 캐시를 못 보고 각자 네트워크를
// 탄다. 실제로 절차 파일이 두 번씩 내려왔다 — 토큰 판정과 선택기 목록이 나란히 부르기 때문이다.
// 진행 중인 약속 자체를 담아 두 번째 호출이 그것을 기다리게 한다(routePlanner의 loadOnce와 같은 방식).
const cache = {}

function loadFile(file) {
  if (cache[file]) return cache[file]
  const pending = fetch(`${BASE}/${file}`).then((res) => res.json())
  // 실패는 캐시하지 않는다 — 한 번 끊긴 자료가 새로고침 전까지 영영 비어 있으면 안 된다.
  pending.catch(() => { delete cache[file] })
  cache[file] = pending
  return pending
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
        altitude: f.altitude ?? null,
      })),
      label: `${proc.name} (RWY ${(proc.runways ?? []).join(', ')})`,
    }))
}

export const KNOWN_AIRPORTS = ['RKSI', 'RKSS', 'RKPC', 'RKPK', 'RKJB', 'RKNY', 'RKJY', 'RKPU', 'RKTH', 'RKTU', 'RKNW', 'RKPS', 'RKJJ', 'RKJK']
