// MOA 활성화 계약 픽스처. 2026-07-25 라이브 NOTAM(aim.koca.go.kr)에서 그대로 캡처한
// 좌표·코드·고도를 쓴다 — 매칭 로직이 검증하는 값이 실제 데이터여야 의미가 있다.
//   D2117/26 'CATA 7H ACT'          → 본문 코드로 매칭(쌍둥이 층 CATA 7L이 아니라 7H를 골라야 함)
//   E3513/26 'TEMPO RESTRICTED ...' → 본문에 구역명이 없어 좌표로만 매칭(MOA 27S)
// 유효시각만 실행 시점 기준 상대값으로 바꾼다 — 원본 유효기간이 지나면 계약이 시간 때문에 깨지므로.
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
    "schedule_text": "JUL 24 0600-1100, 26 2300-2359, 27-30 0000-0100 2300-2359, 31  0000-0100, AUG 01 0000-0900",
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
    "schedule_text": "26 2050-2130, 27 0800-0930, 28 2150-2230, 30 0000-0130",
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

export function moaActivationNotam(nowMs = Date.now()) {
  const iso = (ms) => new Date(ms).toISOString()
  return {
    fetched_at: iso(nowMs),
    horizon_hours: 24,
    items: CAPTURED.map((it) => ({
      ...it,
      category: 'restricted',
      scope: 'airport',
      valid_from: iso(nowMs - 60 * 60 * 1000),
      valid_to: iso(nowMs + 24 * 60 * 60 * 1000),
    })),
  }
}

// D)(시간 조건)를 지운 판 — 조건 없이 '발효 중'으로 판정되는 활성 표시를 확인하기 위한 변형.
export function moaActivationNotamDefinite(nowMs = Date.now()) {
  const payload = moaActivationNotam(nowMs)
  return { ...payload, items: payload.items.map(({ schedule_text, ...rest }) => rest) }
}
