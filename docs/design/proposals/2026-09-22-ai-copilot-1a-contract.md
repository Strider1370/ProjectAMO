# AI Copilot 0 → 1A 구현 계약

2026-09-22. 대상은 LLM/MCP 없는 `get_airport_weather`와 공항 digest다. [구현 계획](2026-09-21-ai-copilot-implementation-plan.md)의 0+1A를 구체화한다. 아래 계약은 새 코드에 적용하며 기존 API/파서/브리핑 결과를 변경하지 않는다. 기준 자료 inventory와 기존 테스트 실행 기록은 주 담당의 0단계 기록을 사용한다.

## 1. 확인한 코드와 재사용 경계

- `shared/airports.js`: 국내 15개 공항, `icao/name/nameKo`만 이름 해석의 기준으로 사용한다. 해외 공항 검색/지역 묶음은 1A 밖이다.
- METAR snapshot은 `{ airports: { [icao]: { header, observation, cavok_flag, nsc_flag, trend } }, fetched_at, ... }`. `observation`에는 `wind/visibility/weather/clouds/temperature/qnh/rvr/wind_shear/display`가 있다. 파서의 단위와 null을 보존한다.
- TAF는 `{header:{icao,issued,valid_start,valid_end,source,...},base,change_groups,timeline}`. `base`와 변화군은 `vis/wx/cavok_flag`; timeline은 `visibility/weather`라는 서로 다른 이름을 쓴다.
- `ceilingFromClouds`, `categoryDetail`, `categoryFor`를 재사용한다. 현 범주는 **공항 기본 미니마 기반 3단계**다. `to3Level`은 digest에 사용하지 않고 새 표준 4단계 계산도 만들지 않는다.
- `selectTafAtEta`는 기간 밖도 최근 항목을 반환한다. `metricsAt`은 30분 제한이 있지만 header 유효기간 검사 자체는 아니다. 1A coverage를 이 함수들만으로 판정하지 않는다.
- TAF parser timeline은 BECMG를 시작부터 누적하고 TEMPO/PROB도 합친 화면용 결과다. 이를 확정적 지속 예보로 표현하지 않는다. `buildDestination().periods`도 원래 변화군의 필드별 상속을 대신할 근거로 쓰지 않는다.
- 국내 processor/store hydration은 재구성 TAC를 `header.raw_text`에도 채운다. **raw_text 존재 여부는 original의 증거가 아니다.** 재구성은 기존 `serializers/metar-tac.js`, `taf-tac.js`를 사용한다.
- warning snapshot은 `{type:'AIRPORT_WARNINGS',fetched_at,total_count,airports:{[icao]:{airport_name,warnings:[{issued,wrng_type,wrng_type_key,wrng_type_name,valid_start,valid_end,raw_message}]}}}`. 파서의 `normalEmpty`는 비열거 속성이므로 저장 JSON에서 존재한다고 가정하지 않는다.

## 2. 실행 함수와 주입

```js
createDataContext({ readers, weatherNow, realNow, clockMode, displayTimezone })
resolveAirport(query) // 순수 함수, 카탈로그 기반
await getAirportWeather(input, context) // export; 도구명 get_airport_weather
buildAirportDigest({ icao, metar, taf, warnings, window }) // 순수 투영
```

`weatherNow/realNow`는 epoch milliseconds를 반환하는 필수 함수다. 요청 시작에 각각 한 번 읽어 `effectiveNow/generatedAt`에 UTC ISO로 기록한다. `clockMode`는 `live|fixture`, `displayTimezone`은 검증된 IANA timezone(UTC 포함)이며 모델 인자가 아닌 호출자 컨텍스트다. 1A는 상대시간 문장 해석·TTL·참조 저장소를 구현하지 않는다.

`readers.metar/taf/warning`은 각각 **인자 없는 async 함수**, 요청당 최대 한 번 호출한다. 반환값은 `{snapshot,meta}`; snapshot은 현재 저장 shape 또는 null이다. reader는 이미 읽은 fixture/캐시를 전달하며 도구가 store/config/server를 import하거나 HTTP로 자기 API를 부르지 않는다. 1A 기본 파일 reader/전역 data view 전환은 만들지 않는다. 실제 자료 검증 스크립트는 고정 로컬 파일을 읽어 이 reader에 주입한다.

`meta`의 허용 키는 `snapshotId,contentHash,publicationId,runId,collectionStatus,collectionReason,sourceCategories`다. 앞 4개는 string|null, collectionStatus는 `complete|empty|partial|failed|unknown`, collectionReason은 string|null. `sourceCategories`는 ICAO → `{value:'VFR'|'MVFR'|'IFR'|'LIFR'|'UNKNOWN',path:string}` 맵이며 없으면 빈 맵이다. 이는 원본 범주가 실제 존재하는 legacy 자료의 경로를 기록하는 선택적 reader 메타데이터이며 현재 METAR 파서가 생성하는 필드라고 가정하지 않는다. 임의 범주를 계산해서 여기에 넣지 않는다.

reader rejection은 해당 종류만 `READ_FAILED`로 바꾸고 나머지를 유지한다. null snapshot은 `DATA_UNAVAILABLE`, 잘못된 snapshot/공항 header 불일치는 `INVALID_SOURCE`다. 원본은 수정하지 않으며 deep-freeze fixture로 확인한다. 마지막 정상 snapshot과 `collectionStatus:'failed'`가 함께 오면 사실을 반환하고 수집 실패 issue도 유지한다. `_stale:true`는 last-good 보존 신호로 기록하되 정확한 실패 시각/이유를 추정하지 않는다.

## 3. strict 입력과 envelope

기존 zod v4로 `AirportWeatherInputSchema`, `AirportWeatherOutputSchema`를 export한다. **모든 외부 입력/출력 object와 중첩 object는 strict**; `z.any`, 무제한 passthrough 결과, 암묵 coercion을 금지한다. 원본 reader snapshot은 전체 parser schema를 복제하지 않고 사용 필드만 검증·명시 투영한다. 사용하지 않는 upstream 확장 필드는 원본 hash에는 남고 digest에는 포함되지 않는다.

```js
// 모든 필드는 필수; includeRaw만 false default
{ airports: string[1..15], window: {start: string, end: string}, includeRaw: boolean }
```

공항 문자열은 trim 후 1..80자. window는 초 단위 이상의 ISO datetime으로 `Z` 또는 명시 offset 필수, 실제 달력상 유효해야 하며 UTC 정규화 후 `start < end`, 길이 ≤48h. 날짜만, offset 없는 값, `내일`, 역전/0길이, 추가 키(userId/url/path 포함)는 `INVALID_INPUT`. 같은 instant의 다른 offset 표현은 같은 결과를 만든다. METAR는 **저장된 최신 관측**이며 과거 요청창의 역사 관측을 조회했다는 의미가 아니다; window는 TAF/경보 선별에 적용한다.

공항 해석: trim/NFKC/영문 대소문자 무시/공백 제거 후 ICAO, 전체 name/nameKo, 한글 nameKo의 `국제공항` 또는 `공항` 접미사 제거 이름을 정확 일치한다. 추가 별칭은 `부산→RKPK`, `포항→RKTH`, `경주→RKTH`, `서울→[RKSI,RKSS]` 네 개만 고정한다. fuzzy/substring/지역 추론 금지. `남부권`, `RKZZ`, `KJFK`는 `AIRPORT_NOT_FOUND`. `서울`은 `AMBIGUOUS_AIRPORT`, ICAO 오름차순 후보 `{icao,nameKo}`를 반환한다. 하나라도 미해결이면 reader 호출 없이 전체 error. 성공 후 중복 ICAO 제거, 최초 요청 순서 유지.

출력의 정확한 최상위 키:

```js
{
  schemaVersion: '1', status: 'ok'|'partial'|'error',
  reference: { effectiveNow, generatedAt, clockMode, displayTimezone },
  data: { airports: AirportDigest[] }, sources: Source[], coverage: Coverage[],
  issues: Issue[],
  truncation: { omittedCount: 0, nextCursor: null },
  error: null | { code, message, candidates: {icao,nameKo}[] }
}
```

시각 문자열은 출력에서 모두 `toISOString()` 형식이다. 오류 응답도 같은 envelope; 입력/해석 실패는 빈 배열들과 error를 반환한다. code는 `INVALID_INPUT|AIRPORT_NOT_FOUND|AMBIGUOUS_AIRPORT|DATA_UNAVAILABLE|READ_FAILED|INVALID_SOURCE|INTERNAL_ERROR`. 정상 실행 결과의 오류는 issues에 분리한다. 내부 출력 schema 실패는 성공으로 내보내지 않고 `INTERNAL_ERROR`로 정규화한다(스택/경로 노출 금지). 자료가 모두 사용 불가이면 data/sources/coverage/issues는 진단을 위해 유지하고 error.code는 READ_FAILED → INVALID_SOURCE → DATA_UNAVAILABLE 우선순위에서 실제 발생한 첫 종류, candidates=[]로 정한다. partial/ok이면 error=null이다.

`Issue={code,icao,kind,path,reason}`: icao는 string|null, kind는 `metar|taf|warning|null`, path/reason은 string. code는 위 코드 외 `COLLECTION_FAILED|COLLECTION_PARTIAL|TAF_OUTSIDE_WINDOW|TAF_PARTIAL_COVERAGE|TIMELINE_EMPTY|MISSING_FIELD|UNKNOWN_WARNING_VALIDITY|RAW_UNAVAILABLE|NON_PROJECTED_SIGNIFICANT_DATA`. 종류·공항·path 순서로 안정 정렬한다. `status=error`는 검증/해석 오류 또는 모든 요청 공항의 세 자료 종류가 모두 사용 불가일 때; 일부 사용 가능하고 issue가 있으면 partial, 그 외 ok. source의 collection/freshness unknown만으로 partial을 만들지는 않지만 알려진 값처럼 표현하지 않는다.

## 4. source와 자료 상태

각 공항×자료 종류에 Source 하나를 출력한다(없음/실패도 포함). 정확한 키:

```js
{
 id, icao, kind, provider, snapshotId, publicationId, runId,
 contentHash, hashBasis, observedAt, issuedAt, fetchedAt,
 validStart, validEnd, availability, collectionStatus, collectionReason,
 retainedLastGood, freshness: {status:'unknown',reason:'NO_FRESHNESS_POLICY'}
}
```

- id=`${kind}:${icao}`; kind는 metar/taf/warning. 문자열 메타데이터와 시각의 미상은 null. availability는 `available|missing|failed|invalid`.
- provider는 header.source.identifier, warning은 알려진 KMA reader일 때 KMA(그 외 null). METAR observedAt=observation_time, issuedAt=issue_time; TAF issuedAt=issued, 유효기간은 header; warning 항목 시각은 각 항목에 남긴다. fetchedAt은 source.fetch_time 우선, snapshot.fetched_at 다음. **발표 시각을 수신 시각으로 채우지 않는다.**
- meta.contentHash가 있으면 그대로 보존(hashBasis=`reader`), 없으면 원본 snapshot JSON의 재귀 key 정렬/배열 순서 보존 UTF-8 직렬화 SHA-256(hashBasis=`canonical-snapshot`). snapshot null이면 둘 다 null. hash는 digest나 재구성 TAC의 hash가 아니다. hash 자체를 원자료 식별 ID로 오인하지 않도록 snapshotId가 없으면 null을 유지한다.
- collectionStatus는 메타데이터 부재 시 unknown, retainedLastGood은 report._stale===true. 최신성 임계값을 새로 만들지 않는다. 자료 시각과 유효범위로 사용자가 판단할 수 있게 한다.

## 5. AirportDigest의 정확한 shape

`{icao,nameKo,metar:MetarDigest|null,taf:TafDigest|null,warnings:WarningsDigest}`.

MetarDigest:

```js
{
 sourceId, reportType, observationTime, issueTime,
 wind: null|{direction,speed,gust,unit,variable,calm},
 visibility: {value,minimumValue,minimumDirectionDegrees,cavok,qualifier,unit:'m'},
 clouds: {amount,baseFt,type,raw}[], weather: string[],
 temperature: {air,dewpoint,unit:'C'}, qnh: {value,unit},
 ceilingFt, rvr: {status:'reported'|'not_reported',entries:Rvr[]},
 category: {sourceValue,sourcePath,derivedValue,derivedPolicy:'airport-minima-3-level'},
 rawKind: 'original'|'reconstructed'|'unavailable', raw: string|null,
 missingFields: string[]
}
```

모든 수치는 finite number|null, boolean은 boolean|null, 문자열은 string|null(상수/열거형 제외). `Rvr={runway,mean,minimum,maximum,tendency,operator,unit:'m'}`로 parser의 필드를 그대로 옮긴다. 없음은 entries=[]/not_reported이며 `2000+`, 2000, 안전 판정으로 채우지 않는다. weather는 raw 코드 배열; clouds는 원본 순서. visibility의 9999/CAVOK를 정확히 9999m로 단정하지 않고 cavok flag를 함께 유지한다. ceilingFt는 기존 BKN/OVC 계산이며 VV를 새로 해석하지 않는다. 해당 한계는 completeness 설명에 남긴다.

visibility.qualifier는 `at_least|reported|unknown`: cavok=true 또는 value>=9999이면 at_least, 그 외 finite 값이면 reported, null이면 unknown이다. at_least의 해석 기준은 10000m이며 기존 value=9999 sentinel은 보존한다. TAF ForecastState와 samples에도 동일 규칙의 `visibilityQualifier`를 추가하여 sentinel을 실제 9999m라고 설명하지 않게 한다.

원본 누락 필드는 null/빈 배열과 함께 원본 경로를 missingFields에 정렬 기록; 예: 관측 rvr 필드 자체 부재는 `observation.rvr`, 명시적 []는 누락이 아니다. 필수 관측 값(wind/visibility/clouds/weather/temperature/qnh)의 누락은 MISSING_FIELD issue. 파서가 이미 넣은 기본값의 원문 근거까지 복원할 수 있다고 주장하지 않는다.

category.sourceValue/sourcePath는 검증된 reader 원본 범주 또는 null; MVFR는 그대로 MVFR다. derivedValue는 기존 categoryDetail 결과, 단 visibility 수치도 clouds 배열도 없으면 UNKNOWN. 두 값이 달라도 합치지 않는다. reportType/issueTime 등은 원자료 그대로, 없으면 null.

raw는 includeRaw=false이면 항상 null이나 rawKind는 유지한다. KMA는 header.raw_text 유무와 관계없이 reconstructed; NOAA의 실제 header.raw_text는 original; 출처 불명 원문은 original로 추정하지 않고 unavailable. KMA raw 요청은 header.tac.text/header.raw_text 또는 기존 serializer 결과를 사용하되 모두 reconstructed. 복원 가능 문자열도 없으면 unavailable와 RAW_UNAVAILABLE issue. 원문 길이 상한은 종류·공항당 UTF-8 16KiB; 초과 시 자르지 않고 raw=null 및 RAW_UNAVAILABLE(reason=`RAW_TOO_LARGE`)로 반환한다.

TafDigest:

```js
{
 sourceId, issuedAt, validity:{start,end},
 base: ForecastState,
 changes: {index,type,start,end,probability,semantics,state:ForecastState}[],
 samples: {time,visibilityM,cavok,visibilityQualifier,ceilingFt,derivedCategory,weather:string[]}[],
 sampleSemantics:'parser-merged-samples',
 rawKind, raw, missingFields:string[]
}
```

ForecastState는 `{wind,visibilityM,cavok,visibilityQualifier,clouds,weather,weatherTouched,cloudsTouched,nsw,nsc}`; wind/clouds는 METAR와 동일 투영, weather는 string[]|null, touched/flag는 boolean|null. base.vis→visibilityM, base.wx→weather, *_flag와 *_touched를 그대로 옮긴다. 변화군 누락값을 base로 자동 채우지 않는다. 모든 base/change_groups를 순서대로 보존하여 요청 이전 BECMG/FM의 근거도 잃지 않는다. index는 원래 배열 인덱스다. type은 `BECMG|TEMPO|PROB30|PROB40|PROB30_TEMPO|PROB40_TEMPO|FM`; 알 수 없는 type은 INVALID_SOURCE로 해당 TAF를 사용 불가 처리한다. probability는 PROB30=30/PROB40=40, 나머지 null. semantics는 BECMG=`transition`, FM=`from`, TEMPO=`temporary`, PROB*= `probabilistic`이다.

samples는 **요청창∩유효기간의 [start,end)에 실제로 존재하는 timeline 항목만** 포함한다. 원래 time·수치·현상을 보존하며 categoryFor를 호출한다. 최근 표본을 기간 밖으로 확장하지 않는다. BECMG 구간이 완료됐다는 추정, PROB를 확정 현상으로 바꾸기, worst 값을 지속 조건으로 표현하기를 금지한다. samples=[]이지만 유효기간은 겹칠 수 있다: TIMELINE_EMPTY issue를 반환하고 base/changes는 남긴다. 표본 간 결측을 보간하거나 시간창 전체를 연속 관측했다고 주장하지 않는다.

## 6. coverage와 경보

Coverage는 공항별 `{icao,kind:'taf',requested:{start,end},validity:null|{start,end},intersection:null|{start,end},state,uncovered:{start,end}[]}`. state는 `full|partial|none|unknown`; 모든 구간은 **[start,end)**. 유효 header가 있으면 max(start)/min(end)로 판정, 경계 접촉만 하면 none. unknown은 TAF 없음/실패/invalid이며 uncovered는 전체 요청창이다. full은 header 기간 포함만 뜻하며 sample 완전성을 보증하지 않는다. 부분 교집합은 나머지 앞/뒤 구간을 시간순으로 uncovered에 기록한다. none이면 taf는 보존하되 samples=[]이며 TAF_OUTSIDE_WINDOW. partial이면 TAF_PARTIAL_COVERAGE.

WarningsDigest는 `{sourceId,status,items,unassessedCount}`. status=`present|none|unknown|unavailable|failed`; items는 `{id,type,key,name,issuedAt,validStart,validEnd,relation}`의 strict 배열이며 원문의 장문 raw_message는 제외한다. id는 snapshot의 원래 warnings 배열 index를 이용한 `warning:${icao}:${index}`, type/key/name은 wrng_type/wrng_type_key/wrng_type_name, relation은 `overlap|unknown`. 유효기간이 겹치는 항목 및 시간 미상 항목만 남긴다. 시간 미상은 unassessedCount를 올리고 UNKNOWN_WARNING_VALIDITY issue를 추가한다.

snapshot 존재+검증된 airports 맵의 정상 목록에서 겹치는 항목이 있으면 present(미상만 있으면 unknown). 정상 수집 complete/empty이고 대상 목록이 비거나 유효기간 겹침이 없을 때만 none이다. collectionStatus unknown/partial/failed의 빈 목록은 unknown이며 경보 없음을 단정하지 않는다. null snapshot은 unavailable, reader rejection은 failed. 알려진 collection failed라도 마지막 정상 경보 항목은 삭제하지 않는다. 이는 **저장된 공항경보 범위**이고 SIGMET/NOTAM/모든 위험이 없다는 의미가 아니다.

1A는 목록을 잘라내지 않는다. 일반 digest는 원문/TAC annotation/display/barb 및 전체 API payload를 제외한다. 실제 자료가 비정상적으로 크면 원본 배열을 조용히 자르지 말고 INVALID_SOURCE로 해당 종류를 실패 처리한다(한 공항 clouds≤100, weather≤100, rvr≤100, changes≤200, timeline≤1000, warnings≤1000). truncation.omittedCount=0은 이 목록 절단이 없다는 뜻이며 원본 전체가 요약되었다는 보증이 아니다. 보존 범위는 위 whitelist다. METAR trend가 비어 있지 않거나 observation.wind_shear가 null이 아니면 각각 원본 경로를 담은 NON_PROJECTED_SIGNIFICANT_DATA issue(reason=`STRUCTURED_DIGEST_OMITS_FIELD_CHECK_RAW`)를 추가하여 partial로 표시한다. raw를 요청했어도 구조화 digest의 생략 issue는 유지하며 serializer가 해당 정보를 완전히 재현한다고 보증하지 않는다. 1B 전에는 상세 참조/페이지 기능이 있다고 주장하지 않는다.

## 7. 고정 fixture 9개와 기대값

테스트 파일은 `backend/test/ai-airport-weather.test.js`, 공통 fixture는 `backend/test/fixtures/ai-airport-weather.js`. 아래 각 이름을 정확한 `node:test` 이름으로 사용하며 표의 기대값은 필수 assert다. 공통 시계는 weatherNow=`2026-09-22T15:30:00.000Z`, realNow=`2026-09-22T16:00:00.000Z`; displayTimezone=Asia/Seoul. 기본 window는 `[2026-09-22T15:00Z,2026-09-22T17:00Z)`, 출력 시각은 .000Z 포함이다.

| 테스트 이름 | fixture와 정확한 기대값 |
| --- | --- |
| `1A resolves aliases and rejects ambiguity before reading` | `[' rksi ','인천','김포국제공항','부산']`→`[RKSI,RKSS,RKPK]`; 서울→AMBIGUOUS_AIRPORT/candidates=[RKSI,RKSS]; 남부권/RKZZ/KJFK→AIRPORT_NOT_FOUND; 오류 시 모든 reader 호출 수 0 |
| `1A validates strict absolute windows and timezone boundaries` | `2026-09-23T00:00:00+09:00`→`2026-09-22T15:00:00.000Z`; end=02:00+09→17:00Z; UTC 입력과 data/coverage 동일; 무offset/내일/2026-02-30/역전/48h 초과/추가 키→INVALID_INPUT; reference에는 Asia/Seoul 보존, UTC 컨텍스트에서는 UTC 보존 |
| `1A preserves METAR facts and reconstructed provenance` | 기존 airport-summary SPECI fixture(2026-07-02 08:30Z, 18018G28KT, vis3200, OVC800, BR, 15/13, Q1009)에 source=KMA, rvr=[] 및 국내 hydrated raw_text 설정: ceilingFt=800, derivedValue=IFR, sourceValue=null, rvr={status:not_reported,entries:[]}, rawKind=reconstructed; 기본 raw=null, includeRaw 때 기존 serializer 문자열과 동일; 2000 수치 생성 금지; trend=['TEMPO 3000 BR'] 변형은 partial 및 path=trend의 NON_PROJECTED_SIGNIFICANT_DATA, wind_shear={all_runways:true,runways:null} 변형은 path=observation.wind_shear의 동일 issue |
| `1A preserves original TAC and legacy MVFR without refolding` | NOAA source/raw_text=`METAR RKSI 221500Z 27008KT 9999 BKN020 20/15 Q1013=`; vis9999/BKN2000, reader.sourceCategories.RKSI={value:MVFR,path:'legacy.category'}: sourceValue=MVFR, sourcePath=legacy.category, derivedValue=VFR, rawKind=original, visibility.qualifier=at_least; raw 요청 때 원문 문자 단위 동일; sourceCategories 없으면 sourceValue=null |
| `1A intersects TAF validity with half-open windows` | TAF validity=[15Z,18Z), timeline=15Z/16Z/17Z: 요청[15Z,17Z)→full/samples=15Z,16Z/uncovered=[]; [14Z,16Z)→partial/intersection=[15Z,16Z)/uncovered=[14Z,15Z); [18Z,19Z)→none/intersection=null/samples=[]/uncovered=전체; last timeline 값으로 보충 금지 |
| `1A preserves BECMG TEMPO PROB and sampled limitations` | base vis9999; BECMG[15Z,16Z) vis5000; TEMPO[16Z,17Z) vis2000/wx BR; PROB30_TEMPO[16Z,18Z) vis1000: changes의 3 type/시간/vis 그대로, semantics=[transition,temporary,probabilistic], probability=[null,null,30], 미보고 wind=null; parser가 병합한 16Z vis1000 표본은 samples에 그대로 남되 sampleSemantics=parser-merged-samples; timeline=[] 변형은 coverage full 유지+TIMELINE_EMPTY |
| `1A distinguishes no data read failure and no warnings` | metar 정상, taf reader rejection→partial/taf=null/READ_FAILED; warning snapshot=null→unavailable/DATA_UNAVAILABLE; `{airports:{},total_count:0}`+collection=empty→none/items=[]; 같은 snapshot+unknown→unknown; warning reader rejection→failed/READ_FAILED; 모두 null→error/DATA_UNAVAILABLE |
| `1A retains last good metadata and unknown warning time` | METAR _stale=true+collection failed+snapshotId=s1/contentHash=h1/publicationId=p1/runId=r1: 관측 보존, retainedLastGood=true, collectionStatus=failed, hash=h1/hashBasis=reader, COLLECTION_FAILED; issue_time=null/fetched_at=16Z→issuedAt=null; warning 유효시각 null 1건→status=unknown/unassessedCount=1/relation=unknown 및 UNKNOWN_WARNING_VALIDITY |
| `1A imports without side effects and never mutates snapshots` | child process에서 새 도구 import만 하고 정상 종료(3초 timeout); network/listen/timer/process-spawn/write 계측 호출 0, reader 호출 0; deep-frozen fixture로 정상 실행; nested 추가 출력 키와 Infinity는 output schema reject; 동일 snapshot key 순서만 바꾸면 canonical hash 동일, 값 변경 시 다름 |

TAF 표의 15Z 등은 모두 2026-09-22 같은 날짜이며 별도 언급 없는 header.issued=14Z, source=KMA, 정상 METAR/경보는 함께 제공해 특정 assert 외의 불필요한 실패를 피한다. 테스트 helper는 report를 직접 구성하되 현재 parser field 이름을 사용한다. 기존 parser 테스트 자체를 새로 해석하거나 임의의 4단계 기대값으로 바꾸지 않는다.

## 8. 구현 허용 파일·검증·측정

1A 쓰기 허용: `backend/src/ai/contracts.js`, `data-context.js`, `tools/get-airport-weather.js`, `tools/resolve-airport.js`, `digests/airport-weather.js`; 위 새 테스트/fixture 및 필요하면 `backend/test/ai-airport-weather-import.test.js`. 독립 검토 후 source 경계 검증 보완에는 `backend/src/ai/source-validation.js` 분리를 허용했다. 이는 reader 메타·선택 공항의 사용 필드를 검증하는 순수 모듈이며 기존 파서를 대체하지 않는다. 측정 스크립트/보고서는 ignored `artifacts/ai-copilot/` 아래. 기존 briefing/parsers/store/server/frontend/shared 및 package/lock 변경 금지. 계약 설계 담당의 최초 쓰기 범위는 이 문서 하나다.

구현 검증: `node --test backend/test/ai-airport-weather*.test.js` 후 영향 회귀 `node --test backend/test/airport-summary.test.js backend/test/airport-summary-tac.test.js backend/test/taf-window.test.js backend/test/flight-category.test.js backend/test/metar-tac.test.js backend/test/taf-tac.test.js`. 이미 주 담당이 수행한 전체 기준 테스트를 반복하지 않는다. import 검사는 공항 카탈로그/순수 serializer/briefing 계산만 허용하고 server/config/store/processor/collector/scheduler를 import graph에 넣지 않도록 정적 검사도 병행한다. child process에서 내장 net/http listen, fetch, timer, child_process spawn, fs write 계열을 import 전에 trap하고 ESM 내장 export 동기화 후 import한다. 모듈 로딩용 read 자체는 부수효과 실패로 보지 않는다.

size measurement는 정상 fixture와 확보된 실제 snapshot을 각각 측정한다. 동일 선택 공항의 `{metar,taf,warning}` 원본 report 묶음과 `includeRaw:false` **전체 output envelope**를 비교한다. UTF-8 bytes=`Buffer.byteLength(JSON.stringify(value),'utf8')`; fieldCount는 재귀 object의 own enumerable key 총수(배열 index는 제외, 배열 안 object key는 포함). source 파일/선택 공항/hash/기준 시각/input, 원본 및 digest bytes/fieldCount/비율을 기록한다. 작은 fixture에서 envelope가 더 커져도 사실대로 기록하며 감소율 합격 기준을 만들지 않는다. 토큰은 모델 미선정으로 `not_measured`다. 실제 자료가 없으면 unavailable 사유를 적고 정상 실자료 검증으로 세지 않는다. 큰 원문/전체 API payload를 LLM에 넘기는 경로는 만들지 않는다.

사용자 표시 시각은 후속 소비자가 reference.displayTimezone으로 포맷한다. UTC fixture 표시는 `2026-09-22 15:00 UTC`, Asia/Seoul에서는 `2026-09-23 00:00 KST`가 기대값이다. 1A는 표시 문자열/UI를 새로 만들지 않고 UTC instant와 displayTimezone 전달을 검증한다.

이 계약으로 1A 구현을 시작할 수 있다. 미정인 운영 최신성 임계값, 상대시간 자연어, 해외 카탈로그, 참조 저장소는 명시적으로 범위 밖이며 구현자의 임의 추론으로 채우지 않는다. 자료 inventory/실제 크기 수치/기준 테스트의 실행 증거는 주 담당의 `docs/evaluation/ai-copilot/2026-09-22-1a-baseline.md`와 구현 검증 기록을 사용한다. 주 담당이 확보한 `artifacts/ai-copilot/1a/live-capture/{metar,taf,warning}.json`은 실제 자료 측정 후보이며 이 문서 작성자가 추가 외부 조회하거나 정상 품질을 검증한 것으로 간주하지 않는다. 이 설계 문서 작성 자체는 기능 구현 완료를 뜻하지 않는다.
