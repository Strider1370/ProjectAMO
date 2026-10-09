# KIM ACI 레이어의 운영 연결 계획

2026-10-09 코드 검토 결과. 기존 KIM NWP 레이어와 같은 수집·저장·전송·시간 선택 구조에 채택한 3변수 ACI를 연결하기 위한 계획이다. 이번 작업은 코드 검토와 계획 작성이며 운영 연결 코드를 구현하거나 배포하지 않았다.

## 채택한 제품과 범위

- CAPE: 현재 검증한 지상 parcel 알고리즘, 내부 최대20hPa RK4, 부력 교차점 경계는 MetPy 재확인, 입력 상한150hPa.
- 점수: `0.2*clip(CAPE/2500) + 0.4*clip((rainRate-0.2)/4.8) + 0.4*clip((230-OLR)/50)`, `rainRate=pr*3600`, 각 clip은0~1 제한.
- 색 경계0.25/0.50/0.75, 0.25 미만 투명. 결측을0으로 대체하지 않는다.
- 시각별 수평2차원 점수이며 기압면별 값·운정고도·보정된 발생 확률은 제공하지 않는다.
- 1차 적용은 확대영역 `ea`, 00UTC29시각·06UTC33시각. 원본841×529개 격자를 계산한다.
- 한반도 `kr`의 전 회차 수집 및 기관 고정 브리핑까지는 별도 후속 범위다. 지도에서 `auto`가 `kr`을 선택한 상태에 확대영역 ACI를 몰래 섞지 않는다.

계산 비용과 수치 검증의 원본은 [기존 적용 계획](2026-10-09-expanded-aci-implementation-plan.md), [운영 실측](2026-10-09-expanded-aci-operating-server-validation.md)을 따른다.

## 확인한 현재 코드

| 단계 | 실제 코드 | 확인한 동작 / ACI 적용 기준 |
|---|---|---|
| 확대영역 수집 | `backend/src/processors/kim-expanded-collector.js` | 한 시각의 기본22층과 보조 입력을 받은 뒤 계산 큐에 넘긴다. 다음 시각 다운로드와 앞 시각 계산이 겹친다. |
| 회차 스케줄·보호 | `kim-expanded-processor.js`, `backend/src/collector-registry.js` | 00/06UTC 회차, 대용량 키 시간 제한·시각별 재시도·디스크 보호·동일 작업 잠금·06UTC 한반도 잘라 쓰기. |
| 계산 자식 | `kim-derived-worker.js`, `kim-derived-worker-entry.js` | 작업별 Node 자식을 하나씩 띄우고 부모가 upstream 요청을 대행한다. `kimDerivedJobGate`, 시각별 `heavyChildGate`·메모리 여유 확인·취소·timeout 사용. |
| 파생 계산 | `kim-gktg-processor.js`, `kim-tropopause-processor.js` | 기본 격자는 층별로 읽어 staging 배열 파일을 쓰고 Python에 넘긴다. 코드·입력 revision으로 재계산을 회피하고 `publish:false` 시각 계산과 회차 게시를 분리한다. |
| 저장·게시 | `kim-nwp-store.js`, `kim-doc-store.js` | domain별 경로, 불변 revision·content hash·manifest/latest 원자 게시, JSON/NC/both 모드. 권계면은 기압층 없는 시각별 필드다. |
| 지도 응답 | `kim-map-responses.js`, `shared/kim-map-binary.js` | 지도 파일을 회차 폴더에 미리 압축 저장한다. 공통 KMB1 이진 codec 사용. 저장 회차 삭제와 함께 정리된다. |
| API·도메인 | `backend/server.js` | index 재검증 ETag, field 불변 응답. `resolveKimDomain('auto')`는 확대 **기본 격자** latest가 있으면ea, 없으면kr이다. 제품별로 임의 fallback하지 않는다. |
| API 클라이언트 | `frontend/src/api/weatherApi.js`, `kimMapBinary.js` | index는domain=auto, 받은 index의domain으로 field 조회. gzip 정적 이진 우선·JSON API fallback. |
| 공통 선택 | `useNwpOverlays.js`, `useKimSurfaceWind.js`, `useKimGktg.js` | 바람·기온·구름·착빙·난류가 공통 회차/hf/level 선택을 공유한다. 메인 타임라인의 절대시각을 예보시각에 연결한다. |
| 2차원 레이어 선례 | `useTropopauseJetOverlay.js` | 권계면은level 없이domain/tmfc/hf/revision으로 조회하고 타임라인·발표/유효시각 카드에 참여한다. ACI 데이터 구조의 주된 선례다. |
| 지도·캐시 | `MapView.jsx`, `overlayUtils.js`, `kimFieldCache.js` | MapView는조합·수명주기만 소유. 격자 칸 경계·Mercator행 보정, 스타일 교체 복구, 전체 KIM 캐시64MiB 상한 재사용. |

현재 ACI는 `useAciExperimentOverlay.js`의 고정 `public/data` 사례이며, `MapView.jsx`에서DEV 조건으로 켠다. 운영 API·메인 타임라인·revision 캐시에 연결되지 않았다.

## 그대로 붙이면 생기는 실제 연결 문제

1. **수집 실패 전파:** 현재 collector의 `prefetch` 배열에서 한 보조 입력이 실패하면 그 시각의 `downloaded` 판정을 실패로 만든다. ACI를 여기에 필수 입력처럼 추가하면 q2m/OLR 실패가 다른 레이어 게시까지 막는다. 기존 필수 작업과 ACI 보조 작업 성공 여부를 분리한다.
2. **게시 실패 전파:** 현재 `computed`는GKTG·권계면 성공으로 정해진다. ACI는별도의`aciReadyHours`를 관리하고 기존 KIM 성공 조건을 바꾸지 않는다. ACI 실패도 시각·이유·재시도 상태로 기록한다.
3. **기압층 검증:** `validateKimNwpSelection()`과 `kimMapBinaryRelativePath()`는실제KIM level을 요구한다. ACI용 가짜700hPa를 만들거나 기존 검증을 무조건 완화하면 안 된다. 시간/domain/revision만 검증하는2차원 경로를 추가한다.
4. **메모리:** 운영 processor의 전체21층 배열을 Node JSON cube로 펼치면 메모리가 크게 늘어난다. 층별 typed 읽기→staging→Python memmap/블록 계산을 유지한다. 기존 GKTG decode helper는모든 값 유효를 요구하므로 ACI의 일부 결측 처리를 그대로 복사하지 않는다.
5. **빠른 변경 감지:** 현재 `fingerprintKimNwpBase()`는21개등압면만 포함한다. ACI에는10m T와ps·q2m·pr·OLR도 들어가므로 해당 파일을 포함한 지문이 필요하다.
6. **회차 정리:** `cleanupKimNwpRuns()`는GKTG·권계면 latest 및 running/partial 회차만 추가 보호한다. ACI latest·계산 중 회차도 보호 목록에 등록한다.
7. **동시 표시 시간:** 권계면 훅처럼 독자 latest와가장 가까운시간만 고르면 다른KIM과회차가 다를 수 있다. 여러KIM 레이어와ACI를 함께 켜면공통domain/tmfc/hf가 일치하는필드만 표시한다.
8. **전송 자료형:** KMB1은i16/i32/f64를지원하며float32 전용 전송은없다. 점수를소수4자리 실수로넘기면f64로 커질 수 있다. 점수는0~10000 정수와scale0.0001 메타를 전달해i16로보내고, 결측은null로해석되게 한다.

## 수집·계산 연결

### 입력

| 입력 | 읽는 곳 | 운영 추가 요청 |
|---|---|---:|
| 21개기압면 T·q | 같은domain/tmfc/hf의normalized NC, 필요한변수만층별읽기 | 0 |
| 지상기온 | 기존10m문서의T(t2m을저장한값), 같은시각검증 | 0 |
| ps | `raw/gktg/hf<hf>-ps-0.txt[.gz]` 공유 | 0(캐시있을때) |
| q2m·pr·ulwrtoa | 새`raw/aci/hf<hf>-<name>-0.txt.gz` | **3/시각** |

ps캐시가없으면필요시받되추가호출로별도집계한다. 지상일기도는`prec_acc`누적강수라현재식의`pr`을대체하지않는다. 모든입력은회차·hf·변수·단위·범위·원본격자배열순서를경계에서검증한다. 결측허용정책은검증한CAPE커널에맞춰명시하고유효하지않은열만결측으로남긴다.

신규 `kim-aci-processor.js`에다음경계를둔다.

- `prefetchAciSupplements({root,domain,tmfc,hf,signal,fetchGrid})`: 기존자료와별도로 성공/실패를 반환하는선택입력수집. 다운로드구간에서완료하고계산단계에서는캐시만읽는다. cutoff후늦은upstream요청을만들지않는다.
- `process({domain,tmfc,forecastHours,publish,turn,...})`: 기존파생작업의시각별계산/게시계약. Node층별입력파일생성, Python1worker·1thread,20hPa·블록계산·경계재확인, 결과검증·저장.
- `KIM_DERIVED_JOBS`에`kim_aci`등록. API호출은부모대행으로장부를유지한다. `heavyChildGate`/512MiB여유·nice10·취소·timeout을따른다.
- 확대시각 계산순서는GKTG→권계면→ACI→기존지도응답/강수장이기본안이다. 순번은작업/시각마다반납해위성작업이끼어들수있게한다.
- 확대기본회차가게시할예보시각과ACI준비시각의교집합을ACI index에게시한다. 부분게시시`plannedHours/availableHours/complete`를따로기록한다. 기존레이어의minimum/latest판정을ACI때문에바꾸지않는다.
- ACI게시검증실패면ACI기존latest를유지하고현재선택에ACI가없음을표시한다. 다른회차자료를같은시간인것처럼그리지않는다. 전체ACI가실패하면빈latest를게시하지않는다.

CAPE 계산과 합성점수의 revision을 분리한다. `capeRevision=hash(기온·비습·ps·t2m·q2m+커널코드+20hPa+의존성)`이고, 최종`revision=hash(capeRevision+pr+OLR+점수명세)`다. 임계값/가중치만바뀌면CAPE를다시계산하지않는다. 원문보조입력과출력지문도빠른재실행검사에포함한다.

채택한점수·색기준은신규`shared/aci.js`에순수함수/상수로모은다. Node후처리와프런트가함께사용하고백엔드가프런트파일을import하지않는다. Python은CAPE·CIN·계산상태를담당한다.

## 저장·API·지도 응답 계약

### 저장 경로 초안

```text
<DATA_PATH>/kim_nwp_ea/
  derived/aci/latest.json
  derived/aci/last-attempt.json
  runs/KIMG_NE57_<tmfc>/
    raw/aci/hf<hf>-<name>-0.txt.gz
    derived/aci/cape/hfNNN/<capeRevision>.nc
    derived/aci/hfNNN/<revision>.nc
    derived/aci/<manifestRevision>/manifest.json
    derived/map-bin/aci-<revision>-score-v1/column/hfNNN.bin.gz
```

NC는 독립 시험의 h5py writer 대신 기존 `writeKimDocument/readKimDocument/readKimDocumentTyped`로 다룬다. JSON/NC/both 설정, content hash, 원자 rename, 불변 결과 충돌 검사를 유지한다. `column`은 URL의 2차원 제품 구분이며 실제 고도가 아니다. ACI 전용 경로 검증과 정적 파일 라우팅을 추가한다.

필드는 `type/product/model/domain/grid/time/algorithm/revision/inputRevision/capeRevision/scoreSpec` 메타와 CAPE·CIN·rainRate·OLR·score·status 배열로 구성한다. 입력 상한150hPa, 적분20hPa, 결측 이유/상태, 경계 재확인 수를 기록한다. 내부 status3은 MetPy 재확인 후 해소한다.

API 제안:

- `GET /api/kim/aci/index?domain=auto`: 공통 도메인 선택, latestRun, times(hf/validTime/revision), scoreSpec, planned/available. index는 ETag 재검증.
- `GET /api/kim/aci/field?domain=ea&tmfc=...&hf=...&revision=...`: level 없이 지정한 불변 결과를 조회한다. domain/tmfc/hf/revision을 캐시 키에 포함한다.
- 지도에는 score만 담은 압축 i16 KMB1을 정적 배포하고 JSON을 fallback으로 사용한다. 조회 시 CAPE 계산이나 upstream 요청을 하지 않는다.
- `GET /api/kim/aci/point?...&lon=...&lat=...`: 클릭 지점의 CAPE·강수·OLR·기여도는 같은 revision의 저장 필드에서 조회하는 안이다. 시각 변경 시 이전 응답을 버린다. 매 프레임 입력3개 전체를 지도에 전송할 필요가 없다.
- 운영 지도는 채택 설정으로 고정한다. 이전 설정 비교는 개발 기능으로 남긴다. 운영에서도 사용자 가중치 변경을 제공하려면 상세3배열의 별도 조회를 후속으로 설계한다.

수치 검증은 양자화 이전 계산값으로 수행한다. 지도 score는 `floor(score*10000)`로 저장하고 scale0.0001로 해석하여 색 경계를 보존한다. 지도 색과 클릭 score는 같은 저장값을 사용하고 기여도는 같은 입력/scoreSpec으로 설명한다. 공통 KMB1 codec을 별도 형식으로 교체하지 않는다.

## 프런트엔드 연결

- `weatherApi.js`에 index/field/point 조회, `kimMapBinary.js`에 2차원 URL을 추가한다. auto index가 선택한 domain을 이후 요청에 명시한다.
- 신규 `useKimAci.js`가 index·snapshot 변경·선택 필드·요청 취소·늦은 응답 폐기를 관리한다. `kimFieldCache.view('aci')`로 기존64MiB 상한을 공유한다. 키는 `domain:tmfc:hf:revision:aci`이며 level을 제외한다.
- `useNwpOverlays.js`의 공통 시간 선택에 ACI를 참여시킨다. ACI만 켰을 때는 ACI times로 미래 시간축을 제공한다. 다른 KIM과 함께 켰을 때는 공통 domain/tmfc/hf를 따르고 해당 ACI가 없으면 준비 중/자료 없음으로 표시한다.
- ACI만 켜면 고도 슬라이더를 표시하지 않는다. 층별 레이어와 함께 켜면 고도 변경은 해당 층별 레이어에만 적용한다. ACI 재조회·재계산은 발생하지 않는다.
- `MapView.jsx`는 hook·timestamp·times·legend 조합만 변경한다. 고정 public/data와 DEV 한정 표시를 제품 설정/API 연결로 대체한다.
- 현 `aciExperimentRaster.js`의 셀 배치·`cellCoordinatesForGrid/mercatorSourceRows`·nearest 색 표시를 재사용한다. 별도 adapter가 소스/이벤트 수명주기를 소유하고 styleRevision 복구와 OFF 정리를 처리한다.
- 표시 이름은 ‘대류 영역(ACI)’을 후보로 한다. 실험 점수와 고도 무관 표시를 범례에 밝히고 기존 GK2A ‘대류 가능성’과 구분한다.
- `/api/snapshot-meta`의 `kimNwp.variables.aci.hash`와 스냅샷 캐시 의존 키를 추가한다.
- 기관 고정 브리핑(`dataMode='pinned'`)에는 bundle selector가 없는 동안 라이브 ACI를 섞지 않는다. bundle 저장·revision 고정·보존은 후속 범위다.

## 운영·의존성

`kim_aci` 설정으로 활성화, Python 경로, timeout,20hPa,scoreSpec version을 관리한다. 1차 적용은 기존 확대 collector에서 실행하고 EA를 중복 수집하는 독립 cron을 만들지 않는다. API 집계를 `kim_grid_aci`로 구분한다면 operation registry와 health 매핑을 함께 추가한다. 인증키는 기존 bulkOnly 규칙으로 선택한다.

NumPy/Numba는 기존 고정판을 유지하고 MetPy1.7.1을 운영 의존성으로 추가한다. 기존 GKTG 환경을 함께 쓰는 setup을 우선 검토하고 기존 GKTG·권계면도 재검증한다. 시험용 `.pth` 환경은 운영 배포에 사용하지 않는다. NC 저장은 Node writer이므로 시험 전용 h5py는 운영 필수 의존성이 아니다. 의존성 변경이 있으므로 `deploy/deploy-vm-full.sh` 대상이고 fast deploy만으로 완료할 수 없다.

Numba 캐시는 기존 shared data 경로를 사용한다. run-events·확대 진행률·data-health 및 last-attempt에 ACI 시각 수·실패·계산 시간·메모리 대기를 기록한다. 회차 정리는 ACI latest/running/partial을 보호하고 오래된 입력/출력/map-bin을 함께 삭제한다.

기존 운영 시험은 생성41.23초+추가 입력6.01초로, ACI 추가 비용의 기존 추정은00UTC 약23분·06UTC 약26분이다. 현재 코드에는 지도 이진 응답과 강수 이미지 생성도 있으므로 과거 GKTG+권계면만의 합계를 현재 전체 회차 게시 시간으로 사용하지 않는다. 정식 연결 후 입력 해독·Node/Python 합산 RSS·KMB1 생성·작업 대기·다운로드 중첩까지 포함하여 전체 회차를 재측정한다.

## 구현 순서와 완료 조건

1. 공유 점수 명세·Python 운영 CLI·입력/결측/출력 계약을 만든다. 로컬44만 격자와 채택 설정을 기준으로 비교한다.
2. ACI processor·store 경로/latest/manifest/revision/cache·worker 종류를 추가하고 로컬 기존 입력1시각으로 NC 계산·읽기를 검증한다.
3. 확대 collector의 선택 입력·ACI 작업·별도 성공 목록·부분 게시·보존을 연결한다. API/KMB1을 추가하여 운영과 같은1시각을 로컬에서 재생한다.
4. 프런트 공통 시간 선택·캐시·표시·범례에 연결한다. 바람·기온·착빙·GKTG·ACI의 동시 표시에서 domain/tmfc/hf 일치를 확인한다.
5. 00/06UTC29/33시각을 운영 CPU/RAM 조건에서 측정하고 의존성 포함 배포 준비를 완료한다.

필수 검증:

- 혼합 domain/회차/단위/격자 크기 거부, 지하층·고산·안정/불안정·부분 결측, MetPy 허용 오차, 색 경계 앞뒤.
- 입력 교체 도중 결과 게시 차단, 점수 명세만 바꾸면 CAPE 재사용, 불변 revision 충돌 거부, 출력 손상 탐지.
- ACI 입력/계산 실패가 기존 KIM latest 게시를 막지 않음, 실패한 시각을 ACI index에서 제외, 이전 latest 유지, 실패 시각 재실행 보완.
- NC/JSON/both 읽기 일치, KMB1/JSON 값·결측·색 일치, gzip 이미 해제/미해제 응답, ETag 및 정적 파일 정리.
- ACI 단독 시간축, 다른 레이어와 domain/시각 일치, 고도 변경 때 ACI 추가 조회 없음, 배경지도2회 변경·ON/OFF·빠른 시각 이동·UTC/KST·모바일.
- 공유 캐시64MiB, Node+Python 합산 최대 RSS, 기존 작업 큐·메모리 보호, API 응답, 전체29/33시각 시간·호출·수신량·디스크 실측.

완료는 고정 시연 표시가 아니라, 저장된 각 예보시각의 ACI를 기존 KIM과 같은 영역/시각으로 조회·배포·표시하고 실패/재시도/회차 전환/정리까지 함께 동작하는 것이다.

## 구현 진행 기록

2026-10-09: 공유점수/새색상,Python 운영CLI,ACI processor·불변NC/KMB1·부분게시/retention,선택입력수집과기존worker,API·snapshot 갱신,공통KIM 시간선택·고도독립지도·지점조회,관리상태/진행표시를구현했다. 로컬실제444,889격자로정식저장→API→지도경로를실행했다. 자세한설정과배포범위는[운영안내](../../operations/kim-aci.md)에기록한다. 운영배포·29/33시각전체운영실측,KR 독립수집/pinned bundle은아직수행하지않았다.
