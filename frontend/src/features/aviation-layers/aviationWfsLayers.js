// TMA 라벨 원본이 로마자 도시명뿐("TMA GWANGJU") — 지도 표기만 한글로 치환. 그 외 정보는 그대로 영문.
// 같은 도시 TMA라도 실제로는 고도대별 하위구역(AREA T01~T09 등, 국토부 AIP ENR 1.4 기준)이
// 여러 개 겹쳐있는 게 정상 — 이름만 같아 다 똑같아 보이던 걸 구역코드+고도로 구분되게 한다.
const TMA_CITY_KO = {
  DAEGU: '대구', GANGNEUNG: '강릉', GIMHAE: '김해', GUNSAN: '군산', GWANGJU: '광주',
  HAEMI: '해미', INCHEON: '인천', JEJU: '제주', JUNGWON: '중원', OSAN: '오산',
  POHANG: '포항', SACHEON: '사천', SEOUL: '서울', WONJU: '원주', YECHEON: '예천',
}
const TMA_CITY_KO_MATCH = [
  'match',
  ['get', 'tma_lbl_1'],
  ...Object.entries(TMA_CITY_KO).flatMap(([en, ko]) => [`TMA ${en}`, ko]),
  ['get', 'tma_lbl_1'], // 매핑에 없는 값은 원문 그대로(fallback)
]
// tma_lbl_2 = "AREA T01" 형식 — "AREA " 접두 5글자를 잘라 코드만("T01") 남긴다.
const TMA_LABEL_MATCH = [
  'format',
  TMA_CITY_KO_MATCH, { 'font-scale': 1.1 },
  '\nTMA ', {},
  ['slice', ['get', 'tma_lbl_2'], 5], {},
  '\n \n', {},
  ['get', 'tma_lbl_3'], { 'font-scale': 0.8 },
  '\n───\n', {},
  ['get', 'tma_lbl_4'], { 'font-scale': 0.75 },
]

// 제한/금지/위험구역 지도 라벨 = 카테고리명(한글) + 코드 + 고도밴드(상한───하한).
// NOTAM 구역 라벨(notamGeoJson.js buildMapLabel)과 같은 포맷을 정적 WFS 데이터에 맞게 재구성.
// 원본 데이터에 고도가 아예 없는 구역(예: 제한구역 R14)이 드물게 있음 — 그럴 땐 빈 줄 없이 코드만.
function areaLabelField(koText, codeField, ceilingField, floorField) {
  // 'has'는 키 존재만 확인 — R14처럼 키는 있고 값이 null인 경우를 놓친다. null 값 자체를 검사.
  const hasAltitude = ['all', ['!=', ['get', ceilingField], null], ['!=', ['get', floorField], null]]
  const altitudeBlock = ['case',
    hasAltitude,
    ['concat', '\n \n', ['get', ceilingField], '\n───\n', ['get', floorField]],
    '',
  ]
  return [
    'format',
    koText, {},
    ' ', {},
    ['get', codeField], { 'font-scale': 1.1 },
    altitudeBlock, { 'font-scale': 0.8 },
  ]
}

// 이 레이어들은 공유 레이어 레지스트리(features/map/layerActions.js)에 연동됨.
// id 추가/삭제 시 layerActions.test.js 커버리지 테스트가 동기화를 강제한다.
export const AVIATION_WFS_LAYERS = [
  {
    id: 'fir',
    nameKo: 'FIR',
    nameEn: 'FIR',
    sourceId: 'wfs-fir',
    maskLayerId: 'wfs-fir-outside-mask',
    fillLayerId: 'wfs-fir-fill',
    lineLayerId: 'wfs-fir-line',
    tickLayerId: 'wfs-fir-ticks',
    externalLabelLayerId: 'wfs-fir-external-labels',
    internalLabelLayerId: 'wfs-fir-internal-labels',
    typeName: 'lt_c_aisfirc',
    dataUrl: '/data/fir.geojson',
    fillRole: 'incheon-fir',
    lineRole: 'incheon-fir-boundary',
    color: '#1485d4',
    defaultVisible: true,
    fillOpacity: 0,
    lineOpacity: 0.9,
    lineWidth: 2,
    // 틱은 useFirTickOverlay가 지오메트리로 렌더(wfs-fir-ticks). 간격은 화면 픽셀.
    tickLayerId: 'wfs-fir-ticks',
    tickSpacing: 42,
    innerTickSpacing: 67,
  },
  {
    id: 'sector',
    nameKo: 'Sector',
    nameEn: 'Sector',
    sourceId: 'aviation-sectors',
    fillLayerId: 'aviation-sectors-fill',
    hoverLayerId: 'aviation-sectors-hover',
    lineLayerId: 'aviation-sectors-line',
    labelLayerId: 'aviation-sectors-labels',
    dataUrl: '/data/sectors.geojson',
    color: '#2563eb',
    defaultVisible: false,
    fillOpacity: 0,
    lineOpacity: 0.7,
    lineWidth: 1.2,
  },
  {
    id: 'waypoint',
    nameKo: 'Waypoint',
    nameEn: 'Waypoint',
    sourceId: 'aviation-waypoints',
    pointMaskLayerId: 'aviation-waypoints-route-gap',
    pointLayerId: 'aviation-waypoints-point',
    pointLabelLayerId: 'aviation-waypoints-label',
    dataUrl: '/data/waypoints.geojson',
    color: '#0f766e',
    defaultVisible: false,
    pointRadius: 3,
    pointMaskRadius: 8,
    iconSize: 0.64,
    iconImageByProperty: {
      property: 'symbolType',
      fallback: 'rnav-waypoint-flyby',
      values: {
        'conventional-intersection-flyby': {
          imageId: 'symbol-intersection-conventional-flyby',
          url: '/Symbols/waypoint-conventional-flyby.svg',
        },
        'conventional-intersection-flyover': {
          imageId: 'symbol-intersection-conventional-flyover',
          url: '/Symbols/waypoint-conventional-flyover.svg',
        },
        'rnav-waypoint-flyby': {
          imageId: 'symbol-waypoint-rnav-flyby',
          url: '/Symbols/waypoint-rnav-flyby.svg',
        },
        'rnav-waypoint-flyover': {
          imageId: 'symbol-waypoint-rnav-flyover',
          url: '/Symbols/waypoint-rnav-flyover.svg',
        },
      },
    },
  },
  {
    id: 'navaid',
    nameKo: 'NAVAID',
    nameEn: 'NAVAID',
    sourceId: 'aviation-navaids',
    pointMaskLayerId: 'aviation-navaids-route-gap',
    pointLayerId: 'aviation-navaids-point',
    pointLabelLayerId: 'aviation-navaids-label',
    dataUrl: '/data/navaids.geojson',
    color: '#7c3aed',
    defaultVisible: false,
    pointRadius: 4,
    pointMaskRadius: 9,
    iconSize: 0.9,
    iconImageByProperty: {
      property: 'type',
      fallback: 'VORTAC',
      values: {
        VORTAC: {
          imageId: 'symbol-vortac',
          url: '/Symbols/navaid-vortac.svg',
        },
        'VOR/DME': {
          imageId: 'symbol-vor-dme',
          url: '/Symbols/navaid-vor-dme.svg',
        },
        TACAN: {
          imageId: 'symbol-tacan',
          url: '/Symbols/navaid-tacan.svg',
        },
      },
    },
  },
  {
    id: 'airport',
    nameKo: 'Airport',
    nameEn: 'Airport',
    sourceId: 'aviation-airports',
    pointLayerId: 'aviation-airports-point',
    dataUrl: '/data/airports.geojson',
    color: '#be123c',
    defaultVisible: true,
    pointRadius: 4,
    iconSize: 0.9,
    iconImageByProperty: {
      property: 'airportUse',
      fallback: 'civil',
      values: {
        civil: {
          imageId: 'symbol-airport-civil',
          url: '/Symbols/airport-civil.svg',
        },
        joint: {
          imageId: 'symbol-airport-joint',
          url: '/Symbols/airport-joint.svg',
        },
        military: {
          imageId: 'symbol-airport-military',
          url: '/Symbols/airport-military.svg',
        },
      },
    },
  },
  {
    id: 'ctr',
    nameKo: 'CTR',
    nameEn: 'CTR',
    sourceId: 'wfs-ctr',
    fillLayerId: 'wfs-ctr-fill',
    lineLayerId: 'wfs-ctr-line',
    typeName: 'lt_c_aisctrc',
    dataUrl: '/data/ctr.geojson',
    color: '#2563eb',
    lineDasharray: [2, 1.5],
    defaultVisible: false,
    fillOpacity: 0.04,
    lineOpacity: 0.85,
    lineWidth: 1.5,
  },
  {
    id: 'tma',
    nameKo: 'TMA',
    nameEn: 'TMA',
    sourceId: 'wfs-tma',
    fillLayerId: 'wfs-tma-fill',
    lineLayerId: 'wfs-tma-line',
    labelLayerId: 'wfs-tma-labels',
    labelTextField: TMA_LABEL_MATCH,
    // TMA는 실제로 같은 도시 이름 아래 고도대별 하위구역이 여러 개 겹쳐있어 라벨도 여러 개 —
    // allow-overlap:true였을 때 서로 겹쳐 찍혀 글자가 뭉개짐. 겹치면 하나만 남기고, 4줄짜리라 여유 있는 줌부터.
    labelAllowOverlap: false,
    labelMinzoom: 7,
    typeName: 'lt_c_aistmac',
    dataUrl: '/data/tma.geojson',
    color: '#0891b2',
    defaultVisible: false,
    fillOpacity: 0.03,
    lineOpacity: 0.85,
    lineWidth: 1.5,
  },
  {
    id: 'restricted',
    nameKo: 'Restricted',
    nameEn: 'Restricted',
    sourceId: 'wfs-restricted',
    fillLayerId: 'wfs-restricted-fill',
    lineLayerId: 'wfs-restricted-line',
    labelLayerId: 'wfs-restricted-labels',
    labelTextField: areaLabelField('제한구역', 'res_lbl_1', 'res_lbl_2', 'res_lbl_3'),
    labelMinzoom: 7,
    labelAllowOverlap: false,
    typeName: 'lt_c_aisresc',
    dataUrl: '/data/restricted.geojson',
    color: '#dc2626',
    defaultVisible: false,
    fillOpacity: 0.05,
    lineOpacity: 0.9,
    lineWidth: 1.5,
  },
  {
    id: 'prohibited',
    nameKo: 'Prohibited',
    nameEn: 'Prohibited',
    sourceId: 'wfs-prohibited',
    fillLayerId: 'wfs-prohibited-fill',
    lineLayerId: 'wfs-prohibited-line',
    labelLayerId: 'wfs-prohibited-labels',
    labelTextField: areaLabelField(['coalesce', ['get', 'prh_lbl_4'], '비행금지구역'], 'prh_lbl_1', 'prh_lbl_2', 'prh_lbl_3'),
    labelMinzoom: 7,
    labelAllowOverlap: false,
    typeName: 'lt_c_aisprhc',
    dataUrl: '/data/prohibited.geojson',
    color: '#dc2626',
    defaultVisible: false,
    fillOpacity: 0.06,
    lineOpacity: 0.9,
    lineWidth: 1.7,
  },
  {
    id: 'danger',
    nameKo: 'Danger',
    nameEn: 'Danger',
    sourceId: 'wfs-danger',
    fillLayerId: 'wfs-danger-fill',
    lineLayerId: 'wfs-danger-line',
    labelLayerId: 'wfs-danger-labels',
    labelTextField: areaLabelField('위험구역', 'dng_lbl_1', 'dng_lbl_2', 'dng_lbl_3'),
    labelMinzoom: 7,
    labelAllowOverlap: false,
    typeName: 'lt_c_aisdngc',
    dataUrl: '/data/danger.geojson',
    color: '#dc2626',
    defaultVisible: false,
    fillOpacity: 0.05,
    lineOpacity: 0.9,
    lineWidth: 1.5,
  },
  {
    id: 'ats-route',
    nameKo: 'ATS Route',
    nameEn: 'ATS Route',
    sourceId: 'wfs-airway',
    lineLayerId: 'wfs-ats-route-line',
    routeLabelLayerId: 'wfs-ats-route-label',
    typeName: 'lt_l_aispath',
    dataUrl: '/data/airways.geojson',
    color: '#1f2933',
    routePrefixFilter: ['!', ['in', ['slice', ['get', 'ident_txt'], 0, 1], ['literal', ['L', 'Y', 'Z']]]],
    defaultVisible: false,
    lineOpacity: 0.9,
    lineWidth: 1.4,
  },
  {
    id: 'rnav-route',
    nameKo: 'RNAV Route',
    nameEn: 'RNAV Route',
    sourceId: 'wfs-airway',
    lineLayerId: 'wfs-rnav-route-line',
    routeLabelLayerId: 'wfs-rnav-route-label',
    typeName: 'lt_l_aispath',
    dataUrl: '/data/airways.geojson',
    color: '#0076c8',
    routePrefixFilter: ['in', ['slice', ['get', 'ident_txt'], 0, 1], ['literal', ['L', 'Y', 'Z']]],
    defaultVisible: false,
    lineOpacity: 0.9,
    lineWidth: 1.4,
  },
  {
    // 해외(아시아) 항로 — X-Plane navdata 기반 테스트 데이터(scripts/generate_overseas_navdata.py).
    // 도메스틱 airways.geojson과 동일 ident_txt/MultiLineString 스키마라 같은 라인 렌더 경로 사용.
    // 정식 회사 AIRAC 붙으면 airways-overseas.geojson만 교체.
    id: 'overseas-route',
    nameKo: '해외 항로',
    nameEn: 'Overseas Route',
    sourceId: 'aviation-overseas-route',
    lineLayerId: 'aviation-overseas-route-line',
    dataUrl: '/data/airways-overseas.geojson',
    color: '#e0651a',
    defaultVisible: false,
    lineOpacity: 0.85,
    lineWidth: 1.2,
  },
  {
    // 해외 웨이포인트 — X-Plane earth_fix(2012) 기반 테스트 데이터. 원본에 종류 정보가 없어(위경도+식별자뿐)
    // 종류별 구분 불가 → 항로 지점 대부분인 RNAV 웨이포인트 아이콘으로 통일(국내 waypoint 기본 아이콘과 동일).
    // 회사 AIRAC 붙으면 종류(symbolType)를 담아 국내처럼 종류별 아이콘 매핑 가능.
    id: 'overseas-waypoint',
    nameKo: '해외 웨이포인트',
    nameEn: 'Overseas Waypoint',
    sourceId: 'aviation-overseas-waypoint',
    pointLayerId: 'aviation-overseas-waypoint-point',
    inlineLabelField: 'ident', // 아이콘과 같은 심볼로 이름 표시(text-optional=아이콘 우선)
    pointLabelMinzoom: 6, // 이 줌부터 이름 표시(한 단계 낮춰 줌아웃해도 보이게)
    iconAllowOverlap: false, // 겹치면 아이콘 생략 → 줌아웃할수록 듬성듬성
    pointMinzoom: 4, // 대륙 스케일(줌<4)에선 아예 숨김
    dataUrl: '/data/waypoints-overseas.geojson',
    color: '#0f766e',
    defaultVisible: false,
    iconSize: 0.6,
    iconImageByProperty: {
      property: 'symbolType',
      fallback: 'rnav',
      values: {
        rnav: {
          imageId: 'symbol-waypoint-overseas-rnav',
          url: '/Symbols/waypoint-rnav-flyby.svg',
        },
      },
    },
  },
  {
    // 해외 항행안전시설(VOR/NDB/DME) — X-Plane earth_nav 기반 테스트 데이터(아시아+인천FIR밖).
    // 정식 회사 AIRAC 붙으면 navaids-overseas.geojson만 교체.
    id: 'overseas-navaid',
    nameKo: '해외 항행안전시설',
    nameEn: 'Overseas NAVAID',
    sourceId: 'aviation-overseas-navaid',
    pointLayerId: 'aviation-overseas-navaid-point',
    inlineLabelField: 'ident',
    pointLabelMinzoom: 6,
    iconAllowOverlap: false,
    pointMinzoom: 4,
    dataUrl: '/data/navaids-overseas.geojson',
    color: '#7c3aed',
    defaultVisible: false,
    iconSize: 0.8,
    iconImageByProperty: {
      // 국내 navaid와 동일한 종류별 아이콘(VORTAC/VOR-DME/TACAN)
      property: 'type',
      fallback: 'VOR/DME',
      values: {
        VORTAC: { imageId: 'symbol-ov-vortac', url: '/Symbols/navaid-vortac.svg' },
        'VOR/DME': { imageId: 'symbol-ov-vor-dme', url: '/Symbols/navaid-vor-dme.svg' },
        TACAN: { imageId: 'symbol-ov-tacan', url: '/Symbols/navaid-tacan.svg' },
      },
    },
  },
  {
    // 해외 공항 — OurAirports 좌표(scripts/generate_overseas_airports.py). MVP 대상 해외 목적지.
    // 아이콘만 표시(ICAO 빨간 라벨 제거 — 기상 마커와 중복·혼잡 방지). 회사 자료 오면 airports-overseas만 교체.
    id: 'overseas-airport',
    nameKo: '해외 공항',
    nameEn: 'Overseas Airport',
    sourceId: 'aviation-overseas-airport',
    pointLayerId: 'aviation-overseas-airport-point',
    dataUrl: '/data/airports-overseas.geojson',
    color: '#be123c',
    defaultVisible: true,
    iconSize: 0.9,
    iconImageByProperty: {
      property: 'airportUse',
      fallback: 'civil',
      values: {
        civil: { imageId: 'symbol-airport-civil', url: '/Symbols/airport-civil.svg' },
      },
    },
  },
  {
    // 해외 FIR 경계 — VATSIM VAT-Spy Boundaries(scripts/generate_overseas_fir.mjs, CC-BY-SA-4.0).
    // 인천 FIR과 동일하게 실선 경계선+라벨로 표시(선 스타일 동일). 인천 전용(마스크·틱)은 제외.
    id: 'overseas-fir',
    nameKo: '해외 FIR',
    nameEn: 'Overseas FIR',
    attribution: 'FIR boundaries © VATSIM VAT-Spy (CC-BY-SA-4.0)',
    sourceId: 'aviation-overseas-fir',
    fillLayerId: 'aviation-overseas-fir-fill',
    lineLayerId: 'aviation-overseas-fir-line',
    // 라벨은 인천 FIR과 동일: 지정 좌표의 point(role external-label)를 addFirLabelLayer가 code/이름 포맷으로 렌더.
    externalLabelLayerId: 'aviation-overseas-fir-labels',
    dataUrl: '/data/fir-overseas.geojson',
    color: '#1485d4',
    defaultVisible: true,
    fillOpacity: 0,
    lineOpacity: 0.9,
    lineWidth: 2,
  },
]

// A single mobile panel tile controls each domestic/overseas pair.
export const AVIATION_PANEL_MERGE_GROUPS = {
  airport: ['airport', 'overseas-airport'],
  fir: ['fir', 'overseas-fir'],
}
