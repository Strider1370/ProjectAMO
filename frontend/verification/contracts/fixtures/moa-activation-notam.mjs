// MOA 활성화 계약 픽스처. 2026-07-25 라이브 NOTAM(aim.koca.go.kr)에서 캡처한 좌표·코드·고도를 쓴다.
//   D2117/26 'CATA 7H ACT'          → 본문 코드로 매칭(쌍둥이 층 CATA 7L이 아니라 7H를 골라야 함)
//   E3513/26 'TEMPO RESTRICTED ...' → 본문에 구역명이 없어 좌표로만 매칭(MOA 27S)
//
// 시각은 전부 실행 시점 기준으로 만든다 — 절대 날짜를 박으면 그 날짜가 지나는 순간 계약이 깨진다.
// D)는 날짜 없는 반복 창(HHMM-HHMM)으로 넣어 어느 시각에 돌려도 결과가 같게 한다.
const CAPTURED = [
  {
    "id": "D2117/26",
    "qcode": "QRACA",
    "location": "RKRR",
    "summary": "CATA 7H ACT",
    "rawText": "CATA 7H ACT",
    "altitude": {
      "lower": 2500,
      "upper": 5000,
      "unit": "FT",
      "ref": "AMSL"
    },
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [
          129.43527777777777,
          36.833333333333336
        ],
        [
          129.8477777777778,
          36.833333333333336
        ],
        [
          129.8477777777778,
          36.5
        ],
        [
          129.43527777777777,
          36.5
        ],
        [
          129.43527777777777,
          36.833333333333336
        ],
        [
          129.43527777777777,
          36.833333333333336
        ]
      ]
    }
  },
  {
    "id": "E3513/26",
    "qcode": "QRTCA",
    "location": "RKRR",
    "summary": "TEMPO RESTRICTED AREA ACT AS FLW",
    "rawText": "TEMPO RESTRICTED AREA ACT AS FLW\n\nAREA BOUNDED BY THE FOLLOWING\n\n353810N1272850E-353940N1282410E-353745N1282550E-351515N1282350E-35140\n\n0N1272400E-353810N1272850E\n\nRMK : 1. EXC SKED CIV ACFT INBOUND TO/OUTBOUND FM RKJY AND RKPS\n\n      2. EXCLUDING THE AREA THAT OVERLAP WITH ATS RTE V547/Y657",
    "altitude": {
      "lower": 7000,
      "upper": 43000,
      "unit": "FT",
      "ref": null
    },
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [
          127.48055555555555,
          35.63611111111111
        ],
        [
          128.40277777777777,
          35.66111111111111
        ],
        [
          128.43055555555554,
          35.62916666666667
        ],
        [
          128.3972222222222,
          35.25416666666667
        ],
        [
          127.4,
          35.233333333333334
        ],
        [
          127.48055555555555,
          35.63611111111111
        ],
        [
          127.48055555555555,
          35.63611111111111
        ]
      ]
    }
  }
]

const HHMM = (ms) => {
  const d = new Date(ms)
  return String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0')
}
const HOUR = 60 * 60 * 1000

function base(nowMs) {
  const iso = (ms) => new Date(ms).toISOString()
  return CAPTURED.map((it) => ({
    ...it,
    category: 'restricted',
    scope: 'airport',
    valid_from: iso(nowMs - HOUR),
    valid_to: iso(nowMs + 24 * HOUR),
  }))
}

// CATA 7H는 지금이 D) 창 안(활성), MOA 27S는 창 밖(발효 예정) — 빗금은 앞의 것만 나와야 한다.
export function moaActivationNotam(nowMs = Date.now()) {
  const items = base(nowMs)
  const inWindow = HHMM(nowMs - HOUR) + '-' + HHMM(nowMs + HOUR)
  const outOfWindow = HHMM(nowMs + 2 * HOUR) + '-' + HHMM(nowMs + 3 * HOUR)
  return {
    fetched_at: new Date(nowMs).toISOString(),
    horizon_hours: 24,
    items: items.map((it) => ({ ...it, schedule_text: it.id === 'D2117/26' ? inWindow : outOfWindow })),
  }
}

// D) 자체가 없는 판 — 유효기간 안이면 조건 없이 발효 중이다.
export function moaActivationNotamDefinite(nowMs = Date.now()) {
  return { fetched_at: new Date(nowMs).toISOString(), horizon_hours: 24, items: base(nowMs) }
}

// 문법에 없는 D) — 해석 불가라 '조건 확인'으로 남고 옅은 빗금이 된다.
export function moaActivationNotamUnreadable(nowMs = Date.now()) {
  const payload = moaActivationNotamDefinite(nowMs)
  return { ...payload, items: payload.items.map((it) => ({ ...it, schedule_text: 'MON-FRI SR-SS' })) }
}
