// Display helpers for the ADS-B popup: Korean type names, airport names, and route lookup.

export const TYPE_NAMES_KO = {
  B731: '보잉 737-100', B732: '보잉 737-200', B733: '보잉 737-300', B734: '보잉 737-400',
  B735: '보잉 737-500', B736: '보잉 737-600', B737: '보잉 737-700', B738: '보잉 737-800',
  B739: '보잉 737-900', B37M: '보잉 737 MAX 7', B38M: '보잉 737 MAX 8', B39M: '보잉 737 MAX 9',
  A318: '에어버스 A318', A319: '에어버스 A319', A320: '에어버스 A320', A321: '에어버스 A321',
  A19N: '에어버스 A319neo', A20N: '에어버스 A320neo', A21N: '에어버스 A321neo',
  B752: '보잉 757-200', B753: '보잉 757-300', BCS1: '에어버스 A220-100', BCS3: '에어버스 A220-300',
  E170: '엠브라에르 E170', E75L: '엠브라에르 E175', E190: '엠브라에르 E190', E195: '엠브라에르 E195',
  CRJ7: '봄바디어 CRJ700', CRJ9: '봄바디어 CRJ900',
  A332: '에어버스 A330-200', A333: '에어버스 A330-300', A338: '에어버스 A330-800neo',
  A339: '에어버스 A330-900neo', A342: '에어버스 A340-200', A343: '에어버스 A340-300',
  A345: '에어버스 A340-500', A346: '에어버스 A340-600', A359: '에어버스 A350-900', A35K: '에어버스 A350-1000',
  A388: '에어버스 A380-800',
  B762: '보잉 767-200', B763: '보잉 767-300', B764: '보잉 767-400',
  B772: '보잉 777-200', B773: '보잉 777-300', B77L: '보잉 777-200LR/F', B77W: '보잉 777-300ER',
  B788: '보잉 787-8', B789: '보잉 787-9', B78X: '보잉 787-10',
  B744: '보잉 747-400', B748: '보잉 747-8', MD11: 'MD-11',
  DH8D: '봄바디어 Dash 8 Q400', AT72: 'ATR 72', AT76: 'ATR 72-600', DHC6: '드 해빌랜드 트윈오터',
  C172: '세스나 172', C208: '세스나 캐러밴',
  H60: '시코르스키 S-70', EC35: '에어버스 H135', S76: '시코르스키 S-76',
}

// Korean airport names (ICAO). Foreign airports fall back to the city name from adsbdb.
export const AIRPORT_NAMES_KO = {
  RKSI: '인천', RKSS: '김포', RKPC: '제주', RKPK: '김해', RKTU: '청주', RKTN: '대구',
  RKJB: '무안', RKNY: '양양', RKJK: '군산', RKPS: '사천', RKTH: '포항경주', RKNW: '원주',
  RKJJ: '광주', RKPU: '울산', RKJY: '여수', RKTL: '울진', RKSM: '서울(공군)',
  RJAA: '나리타', RJTT: '하네다', RJBB: '간사이', RJGG: '주부', RJCC: '신치토세', RJFF: '후쿠오카',
  ROAH: '나하', RJSA: '아오모리', RJOA: '히로시마', RJAH: '이바라키', ROIG: '이시가키', RJFK: '가고시마',
  RJFR: '기타큐슈', RJBE: '고베', RJNK: '고마쓰', RJFT: '구마모토', RJOM: '마쓰야마', RJFM: '미야자키',
  RJFU: '나가사키', RJSN: '니가타', RJCB: '오비히로', RJFO: '오이타', RJOB: '오카야마', RJFS: '사가',
  RJSS: '센다이', RORS: '시모지시마', RJNS: '시즈오카', RJOT: '다카마쓰', RJOS: '도쿠시마', RJOH: '요나고',
  ZBAA: '서우두', ZBAD: '다싱', ZGHA: '창사', ZYCC: '창춘', ZUTF: '톈푸', ZUCK: '충칭',
  ZYTL: '다롄', ZSFZ: '푸저우', ZGGG: '광저우', ZGKL: '구이린', ZYHB: '하얼빈', ZSOF: '허페이',
  ZBHH: '후허하오터', ZSHC: '항저우', ZYJM: '자무쓰', ZSJN: '지난', ZPPP: '쿤밍', ZSNJ: '난징',
  ZSQD: '칭다오', ZSPD: '푸둥', ZSSS: '훙차오', ZYTX: '선양', ZGSZ: '선전', ZBSJ: '스자좡',
  ZBTJ: '톈진', ZSWH: '웨이하이', ZHHH: '우한', ZSAM: '샤먼', ZLXY: '시안', ZSYN: '옌청',
  ZYYJ: '옌지', ZSYT: '옌타이', ZGDY: '장자제', ZHCC: '정저우',
  RCTP: '타오위안', RCSS: '쑹산', RCKH: '가오슝', RCMQ: '타이중', VHHH: '홍콩', VMMC: '마카오',
  ZMCK: '칭기즈칸', VVDN: '다낭', VVNB: '노이바이', VVTS: '떤선녓', VVCR: '깜라인', VVPQ: '푸꾸옥',
  RPLL: '니노이 아키노', RPVM: '막탄세부', RPLC: '클라크', RPSP: '보홀팡라오', RPVK: '칼리보',
  VTBS: '수완나품', VTCC: '치앙마이', VTSP: '푸껫', WIII: '수카르노하타', WADD: '응우라라이',
  WIDD: '항나딤', WAMM: '삼라툴랑이', WMKK: '쿠알라룸푸르', WBKK: '코타키나발루', WSSS: '창이',
  VDTI: '테초', VLVT: '왓타이', VYYY: '양곤', VIDP: '인디라간디', VNKT: '트리부반',
  UAAA: '알마티', UTTT: '타슈켄트', UCFM: '마나스', LTFM: '이스탄불', OMDB: '두바이',
  EGLL: '히스로', LFPG: '샤를드골', EDDF: '프랑크푸르트', LIMC: '말펜사', LIRF: '피우미치노',
  LEBL: '엘프라트', LEMD: '바라하스', LOWW: '빈', LKPR: '바츨라프하벨', LHBP: '리스트페렌츠',
  LDZA: '프라뇨투지만', EHAM: '스키폴', LPPT: '움베르투델가두', LSZH: '취리히',
  KATL: '하츠필드잭슨', KBOS: '로건', KORD: '오헤어', KDFW: '댈러스포트워스', PHNL: '대니얼K이노우에',
  KLAS: '해리리드', KLAX: '로스앤젤레스', KJFK: '존F케네디', KEWR: '뉴어크리버티', KSFO: '샌프란시스코',
  KSEA: '시애틀터코마', KIAD: '덜레스', CYYZ: '피어슨', CYVR: '밴쿠버', PGUM: '안토니오B원팻', PGSN: '사이판',
  YBBN: '브리즈번', YSSY: '킹스퍼드스미스', NZAA: '오클랜드',
}

export function typeNameKo(typeCode) {
  if (!typeCode) return ''
  return TYPE_NAMES_KO[String(typeCode).toUpperCase()] || typeCode
}

function airportLabel(ap) {
  if (!ap || !ap.icao) return '?'
  const name = AIRPORT_NAMES_KO[ap.icao] || ap.city
  return name ? `${name}(${ap.icao})` : ap.icao
}

export function routeLabel(route) {
  if (!route || !route.origin || !route.destination) return null
  return `${airportLabel(route.origin)} → ${airportLabel(route.destination)}`
}

const routeCache = new Map()
export async function fetchRoute(callsign) {
  if (!callsign) return null
  const key = String(callsign).toUpperCase()
  if (routeCache.has(key)) return routeCache.get(key)
  try {
    const res = await fetch(`/api/adsb/route/${encodeURIComponent(key)}`)
    const data = await res.json()
    const route = data?.route || null
    routeCache.set(key, route)
    return route
  } catch {
    return null
  }
}
