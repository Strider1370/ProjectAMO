# Plan: ProjectAMO 공통 운영 데이터 규격 단계형 구현

**Spec:** `docs/superpowers/specs/2026-07-19-common-operational-data-contract.md`
**Goal:** 현재 Zod, SQLite, 파일 저장 구조를 유지하면서 운영 데이터 family를 하나씩 공통 catalog·schema·출판·조회 interface로 전환한다.

## Global Constraints

- 구현은 이 계획이 승인된 뒤에만 시작한다.
- 새 라이브러리, 메시지 브로커, 별도 schema registry 서버, 중앙 이벤트 이력은 추가하지 않는다.
- 공통 규격의 실행 기준은 backend에 이미 설치된 Zod 4.4.3이며 JSON Schema는 `z.toJSONSchema`로 생성한다.
- 표준 규격은 v1부터 시작한다. 최초 v2 family가 실제로 필요해지기 전에는 범용 전진 변환 registry를 만들지 않는다.
- 기존 `DATA_PATH`, SQLite, checked-in 정적 파일을 물리 저장소로 재사용한다. 과거 파일은 일괄 재작성하지 않는다.
- family 하나가 shadow 출판, 동등성 검증, 새 reader 전환, 기존 경로 제거를 모두 통과하기 전에는 다음 family를 같은 배포에 섞지 않는다.
- `routes.payload`, 저장 경로 geometry, 알림 등록 UX는 변경하지 않는다. geometry는 알림 기능 완성 작업에서 별도로 결정한다.
- `weather.ground_overview`는 catalog에 등록하거나 생산자를 만들거나 삭제하지 않는다.
- 브리핑 계산식, 위험 판단, 화면 디자인은 바꾸지 않는다.
- 사용자 식별값은 HTTP query/payload에서 받지 않고 서버 session에서만 주입한다.
- 수집·저장·조회 시각은 UTC/epoch를 유지하며 KST 등 표시 시간대는 기존 표시 경계에서만 적용한다.
- 수동 텍스트 편집은 `apply_patch`로 수행하고, 코드 변경 뒤 `graphify update .`를 실행한다.

## 결정된 최소 구조

외부 호출자가 배우는 interface는 다음 네 개로 제한한다.

```js
getCatalogEntry(tag)
publishOperationalData({ tag, schemaVersion, representation, view, selectors, time, sourceRefs, data, principalId })
readOperationalData({ tag, schemaVersion, representation, view, selectors, principalId })
createEphemeralOperationalEnvelope({ tag, schemaVersion, representation, view, selectors, time, sourceRefs, data })
```

- `catalog.js`는 설명, 상태, schema, 허용 view·selector, 접근 수준, 소유 범위, 신선도·보존, 인스턴스 경계와 제공자 식별키를 한 entry로 묶는다.
- `schemas.js`는 catalog entry, 공통 `{ meta, data }`, 정규 JSON, `content_hash`, `instance_id` 규칙만 소유한다.
- `publisher.js`는 등록 확인 → Zod 검증 → ID/hash 생성 → 저장 → latest index 갱신을 한 관문에서 처리한다.
- `reader.js`는 tag/version/view/selector/access/principal을 검증하고 전체 envelope를 반환한다.
- 저장 adapter는 실제 두 번째 저장 형태가 등장할 때만 추가한다. 기반 단계에는 JSON snapshot adapter만 두고, remote artifact·model grid·static·SQLite principal adapter는 해당 family 단계에서 추가한다.
- 공통 global latest index는 `DATA_PATH/operational-data/latest/{tag}.json`의 tag별 shard로 원자 갱신한다. 각 shard는 그 tag의 selector 조합만 담고 tag별 직렬 queue를 사용하므로 요청량이 많은 한 family가 다른 family 출판을 막지 않는다. principal index는 SQLite에서 사용자별로 격리한다.
- 기존 family 디렉터리는 그대로 둔다. 새 envelope instance는 해당 디렉터리의 `instances/` 아래에 쓰고, 기존 `latest.json`은 전환 중 rollback용으로만 유지한다.
- 동적 `fresh|stale|expired`는 reader가 응답 시 계산하며 저장된 `content_hash`에는 넣지 않는다.

## 전환 순서와 중간 관문

| 관문 | 통과 조건 | 실패 시 되돌림 |
| --- | --- | --- |
| G0 공통 기반 | catalog 중복·schema 생성·ID/hash 결정성·지원하지 않는 version 거부·출판 실패 시 latest 불변 | 새 module과 route를 제거; 기존 생산·조회 경로는 변경하지 않음 |
| G1 artifact canary | `imagery.radar_tiles` descriptor envelope와 기존 meta가 동등하고 tile은 CDN 직결이며 지도 계약 통과 | common 출판/GET만 끄고 기존 `rainviewer_meta.json` 읽기 유지 |
| G2 일반 JSON pilot | `aviation.notam`의 record ID, AGL/AMSL, geometry, raw text, briefing provenance가 보존 | `/api/notam`과 기존 `latest.json`으로 복귀 |
| G3 다중 원본·부분수집 pilot | `weather.metar` 국내/해외 selector가 충돌하지 않고 partial/current/carried_forward 및 공항 화면·브리핑·알림이 통과 | `/api/metar*`와 두 legacy store를 유지한 채 common reader만 되돌림 |
| G4 예보시간 pilot | `weather.taf` base/change_groups/timeline과 TAC, ETA 선택이 보존 | `/api/taf*`로 복귀 |
| G5 복합 model pilot | `model.kim`의 모든 view/selector, immutable cache, run retention이 통과하고 legacy surface-wind 제거가 별도 commit으로 검증 | legacy surface-wind 제거 commit 전 상태로 복귀 |
| G6 family 관문 | 한 family의 schema/fixture, shadow 동등성, 저장·API·frontend, 구조 검사, browser 계약, rollback 재검증이 모두 통과 | 그 family의 legacy adapter만 유지; 다른 family에는 영향 없음 |
| G7 ephemeral 관문 | 브리핑 envelope는 유효하지만 저장/index/후속 GET에 남지 않고 요청 좌표도 축적되지 않음 | POST 응답 adapter를 이전 payload로 되돌림 |
| G8 principal 관문 | 사용자 A/B 저장·index·GET 격리와 alert 발생/feed/delivery 무손실 migration 통과 | DB transaction rollback 및 dual-read를 기존 표로 복귀 |
| G9 최종 관문 | 36 active + 1 suspended catalog, 15 internal 귀속, direct I/O allowlist 0, 전체 검증 통과 | 마지막 family commit만 되돌리고 완료 선언 보류 |

각 family는 다음 다섯 배포 checkpoint를 순서대로 진행한다. checkpoint 1~4의 additive 변경은 한 개 이상의 commit으로 배포할 수 있지만, checkpoint 5의 legacy 제거는 반드시 별도 cleanup commit으로 둔다. 서로 다른 두 family를 같은 배포에 넣지 않는다.

1. 기존 writer를 유지한 채 common envelope를 shadow 출판한다.
2. common reader 결과와 legacy payload를 fixture·hash 제외 동등성으로 비교한다.
3. 기존 전용 GET을 common reader의 `data`만 풀어 주는 임시 호환 adapter로 바꾼다.
4. frontend와 backend 내부 소비자를 `GET /api/data/{tag}` 및 envelope 보존 흐름으로 전환한다.
5. 한 번 이상의 정상 수집 주기와 rollback 재검증 뒤 해당 legacy writer/GET/direct read allowlist를 제거한다. 과거 파일은 보존 정책으로 자연 정리하고 bulk rewrite/delete하지 않는다.

### 구간별 승인 경계

- 구간 A는 Tasks 1–3 공통 기반만 구현한다. G0 증거와 rollback 결과를 status에 기록하고 사용자 승인을 다시 받기 전에는 Task 4를 시작하지 않는다.
- 구간 B는 Tasks 4–8의 다섯 pilot family를 정해진 순서로 하나씩 구현한다. G1–G5 결과와 실제 변경량·검증 비용을 정리하고 사용자 승인을 다시 받기 전에는 Task 9를 시작하지 않는다.
- 구간 C는 Tasks 9–15의 나머지 family·ephemeral·principal·suspended·최종 정리를 수행한다. pilot에서 확인한 공통화 효과와 문제를 반영해 구간 시작 전에 이 부분의 순서와 관문을 재검토한다.
- 위 다섯 checkpoint는 각각 배포·검증·되돌릴 수 있는 안전 지점이지, 무조건 별도 운영 배포를 5회 수행한다는 뜻은 아니다. checkpoint 1–2는 같은 additive 배포 안에서 검증할 수 있고, consumer 전환과 cleanup은 독립 rollback을 위해 분리한다.

---

## Task 1: 공통 catalog와 versioned schema 기반

**Files:**
- Create: `backend/src/operational-data/catalog.js`
- Create: `backend/src/operational-data/schemas.js`
- Create: `backend/src/operational-data/provider-contracts.js`
- Create: `backend/src/operational-data/transforms.js`
- Create: `backend/src/operational-data/families/imagery.radar_tiles.js`
- Create: `backend/src/operational-data/generate-json-schemas.js`
- Create: `backend/schemas/operational-data/imagery.radar_tiles/v1.json`
- Create: `backend/test/operational-data-catalog.test.js`
- Create: `backend/test/operational-data-json-schema.test.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `getCatalogEntry(tag)`, `listCatalogEntries()`, `operationalMetaSchema`, `defineFamily()`, `defineProviderContract()`, `defineTransform()`, `z.toJSONSchema` 기반 생성 command
- Consumes: Zod 4.4.3, 승인된 family/tag 목록과 `CONTEXT.md` 용어

- [ ] 구현 시작 전에 `CONTEXT.md`의 데이터 family, 카탈로그, 표준 규격, 데이터 상자, ephemeral, 출판·조회 용어가 catalog field 이름과 일치하는지 확인한다. 현재 용어가 충분하므로 새 개념이 생기지 않는 한 `CONTEXT.md`를 수정하지 않는다.
- [ ] `defineFamily()`가 tag 두 칸 형식, `active|suspended|deprecated`, v1 정수 version, 허용 representation `provider_raw|standard|derived|static_reference`, selector/view allowlist, 접근 `public|authenticated|backend-only`, 소유 `global|principal`, `lifecycle: stored|ephemeral`, 시간·공간·CRS·수직기준·단위 profile, `instance_granularity`, provider key, raw/standard retention을 검증하도록 구현한다.
- [ ] `defineProviderContract()`가 provider/product/format/판본, field·unit·time 의미, official reference 또는 보존 fixture/hash를 version별로 등록하게 하고 이미 등록된 판본의 내용을 바꾸면 test가 실패하도록 한다.
- [ ] `defineTransform()`이 `transform_id`, 정수 version, 입력 provider contract+version, 출력 tag+schema version+representation/view, field·unit·time 변환 설명과 fixture를 등록하게 하고 존재하지 않는 입력/출력, 잘못 연결된 version, 과거 version 덮어쓰기를 거부하도록 한다.
- [ ] `operationalMetaSchema`에 `tag`, `schema_version`, `representation`, optional registered `view`, `instance_id`, `content_hash`, `selectors`, 역할별 `time`, `source_refs`, optional collection completeness를 정의한다.
- [ ] `imagery.radar_tiles` entry와 v1 descriptor Zod schema를 첫 catalog entry로 등록한다. external CDN tile bytes가 아니라 URL template/media type/provider/license/frame 목록만 data임을 명시한다.
- [ ] backend package의 `node src/operational-data/generate-json-schemas.js` command가 등록된 모든 version/view JSON Schema를 `backend/schemas/operational-data/imagery.radar_tiles/`부터 결정적으로 생성하도록 하고 `data:schemas` script를 추가한다.
- [ ] test에서 중복 tag, 미등록 representation, 자유 입력 view, 잘못된 selector, version 덮어쓰기, 시간·공간·단위 누락, active인데 schema/fixture/retention/access/ownership이 빠진 entry, provider 판본·transform record 누락, 잘못된 transform 연결과 과거 판본 변경을 실패시킨다.
- [ ] Verify: `npm.cmd --prefix backend run data:schemas; node --test backend/test/operational-data-catalog.test.js backend/test/operational-data-json-schema.test.js`; 두 번 생성한 diff가 없고 모든 test가 pass해야 한다.
- [ ] Commit: `feat(data): add operational catalog and schema source`

## Task 2: envelope 식별, JSON 출판·조회, global latest index

**Files:**
- Create: `backend/src/operational-data/publisher.js`
- Create: `backend/src/operational-data/reader.js`
- Create: `backend/src/operational-data/adapters/json-snapshot.js`
- Create: `backend/src/operational-data/latest-index.js`
- Create: `backend/src/operational-data/index.js`
- Create: `backend/test/operational-data-envelope.test.js`
- Create: `backend/test/operational-data-publisher.test.js`
- Create: `backend/test/operational-data-reader.test.js`
- Modify: `backend/src/store.js:134-295`

**Interfaces:**
- Consumes: `getCatalogEntry()`, family Zod schema, `config.storage.base_path`, 현재 `store.canonicalHash`/rotation 원칙
- Produces: `publishOperationalData()`, `readOperationalData()`, `createEphemeralOperationalEnvelope()`, `readLatestOperationalIndex()`

- [ ] RFC 8785 라이브러리를 추가하지 않고 재귀 key 정렬 JSON으로 표준 `data`를 정규화하고 SHA-256 `content_hash`를 만든다. 변동 수집시각, 신선도, 저장 경로는 제외한다.
- [ ] tag/version/representation/view/정규 selector·provider key/content hash 식별 문서로 SHA-256 `instance_id`를 만들고 같은 의미·내용의 fixture가 경로와 무관하게 같은 ID를 내는 test를 추가한다.
- [ ] JSON snapshot adapter가 기존 family 디렉터리의 `instances/${instance_id}.json`에 envelope를 원자적으로 쓰고 현재 보존 개수를 재사용하며, 성공 뒤에만 `DATA_PATH/operational-data/latest/{tag}.json`의 해당 tag shard를 갱신하도록 한다.
- [ ] `latest-index.js`는 tag별 직렬 queue 안에서 그 shard의 read-modify-write 전체를 수행하고 temp file rename으로 교체한다. 서로 다른 두 tag 출판은 서로의 queue를 기다리지 않고, 같은 tag의 두 selector를 `Promise.all`로 출판해도 entry가 유실되지 않는 test를 추가한다. 한 shard의 지연·실패가 다른 tag 출판을 막거나 되돌리지 않는 fixture도 둔다.
- [ ] `readLatestOperationalIndex()`는 tag shard를 전체 또는 요청 tag만 집계하고, temp file은 무시하며 손상 shard는 tag를 명시한 오류로 격리한다. `/api/snapshot-meta` 호환 출력은 이 집계 결과에서 생성하고 수작업 source 목록을 만들지 않는다.
- [ ] publisher가 schema/selector/source reference 검증 실패, 전체 수집 실패, 저장 실패 때 기존 latest를 바꾸지 않도록 한다.
- [ ] reader가 schema version을 필수로 받고 v1 이외 요청을 406 의미의 `unsupported_schema_version`으로 거부하도록 한다. 전진 변환 registry는 만들지 않는다.
- [ ] `createEphemeralOperationalEnvelope()`는 같은 schema/ID/hash 검증을 수행하되 저장 adapter와 latest index를 호출할 수 없도록 별도 code path로 구현한다.
- [ ] Verify: `node --test backend/test/operational-data-envelope.test.js backend/test/operational-data-publisher.test.js backend/test/operational-data-reader.test.js`; 결정성, partial/latest 보존, 동시 tag·selector index 비충돌, ephemeral 무저장을 모두 pass해야 한다.
- [ ] Commit: `feat(data): add common publisher reader and latest index`

## Task 3: 공통 HTTP·frontend client와 migration 안전망

**Files:**
- Create: `frontend/src/api/operationalData.js`
- Create: `frontend/src/api/operationalData.test.js`
- Create: `backend/test/operational-data-api.test.js`
- Create: `backend/test/operational-data-structure.test.js`
- Modify: `backend/server.js:188-248,378-430,828-830`
- Modify: `frontend/src/api/weatherApi.js:1-330`
- Modify: `frontend/src/app/snapshotMeta.js`
- Modify: `frontend/src/app/useWeatherPolling.js`
- Modify: `frontend/src/app/snapshotMeta.test.js`
- Modify progressively as each listed family moves: `backend/src/dev/scenario.js`

**Interfaces:**
- Consumes: `readOperationalData()`, `readLatestOperationalIndex()`
- Produces: `GET /api/data/:tag`, generic `/api/snapshot-meta` entries, `fetchOperationalData(tag, options)`

- [ ] `GET /api/data/:tag`를 추가하고 `GET /api/data/imagery.radar_tiles?schema_version=1&scope=overseas`와 `GET /api/data/model.kim?schema_version=1&view=wind_field&run=2026071900&forecast_hour=3&level=10m` fixture로 query contract를 고정한다. unregistered tag=404, invalid selector/view=400, unsupported version=406, unauthenticated=401, forbidden/backend-only=403이어야 한다.
- [ ] principal ID는 `req.session.userId`에서만 reader에 넘기고 query/payload의 principal 관련 key를 거부한다.
- [ ] `/api/snapshot-meta`가 common latest index의 `{ tag, schema_version, representation, view, selectors, instance_id, content_hash, time }` entries를 자동 반환하도록 한다. 전환 중에는 기존 수작업 key를 같은 index에서 파생하는 임시 호환 출력으로 유지한다.
- [ ] `fetchOperationalData()`가 tag/version/view/selector를 URL로 만들고 `{ meta, data }`를 그대로 반환하도록 한다. `weatherApi.js`는 family 전환 때만 이 client를 호출하도록 준비하되 아직 기존 key payload를 바꾸지 않는다.
- [ ] structure test에 기존 direct `store.save`, `latest.json`, 전용 GET, `/data/` 읽기와 `backend/src/dev/scenario.js`의 `getCached|updateCache|loadLatest` 위치를 명시적 legacy allowlist로 기록하고 새 위치가 추가되면 실패하게 한다. family 완료 때 그 family의 allowlist 한 줄을 지우며 G9에는 `scenario.js`의 직접 store import가 0이어야 한다.
- [ ] Verify: `node --test backend/test/operational-data-api.test.js backend/test/operational-data-structure.test.js backend/test/snapshot-meta-cache.test.js; node --test frontend/src/api/operationalData.test.js frontend/src/api/weatherApi.test.js frontend/src/app/snapshotMeta.test.js`; legacy payload와 generic entries가 함께 통과해야 한다.
- [ ] Commit: `feat(data): expose tag reader and generic latest index`

## Task 4: 첫 canary — `imagery.radar_tiles`

**Files:**
- Create: `backend/src/operational-data/adapters/remote-artifact.js`
- Create: `backend/test/operational-data-radar-tiles.test.js`
- Create: `frontend/src/features/weather-overlays/lib/rainviewerLayers.test.js`
- Modify: `backend/src/processors/rainviewer-processor.js`
- Modify: `backend/server.js:403,828-830`
- Modify: `backend/test/rainviewer-processor.test.js`
- Modify: `frontend/src/api/weatherApi.js:145-185,326`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- Modify: `frontend/src/features/weather-overlays/lib/rainviewerLayers.js`
- Modify: `frontend/src/app/snapshotMeta.js`

**Interfaces:**
- Consumes: `publishOperationalData()`, `fetchOperationalData()`
- Produces: `imagery.radar_tiles` v1 descriptor envelope with selector `scope=overseas`

- [ ] `buildRainviewerMeta()` 결과를 `scope=overseas`, provider/version/license, frame-list provider key와 함께 shadow 출판하고 기존 `radar/rainviewer_meta.json` 쓰기를 유지한다.
- [ ] raw retention은 외부 catalog JSON·tile bytes 모두 `none`과 이유를 기록하고, standard descriptor는 기존 default 10 instance를 보존하도록 pruning 경계 10/11 fixture를 검증한다.
- [ ] descriptor data가 `artifacts[{ role, url_template, media_type }]`를 포함하고 외부 tile bytes의 hash·저장·proxy를 만들지 않는 test를 추가한다.
- [ ] legacy meta와 envelope `data`의 frame/time/template 동등성을 검증한 뒤 frontend initial/changed fetch를 `GET /api/data/imagery.radar_tiles?schema_version=1&scope=overseas`로 전환한다.
- [ ] Mapbox adapter가 envelope를 보존해 받고 CDN URL은 `envelope.data`에서 만들도록 바꾼다. snapshot change는 `content_hash`/`instance_id`로 판정한다.
- [ ] G1 통과 뒤 `rainviewer_meta.json` 직접 frontend 읽기와 snapshot manual source를 제거한다. 기존 파일 writer는 한 정상 10분 수집 주기와 rollback 확인 뒤 제거한다.
- [ ] Verify: `node --test backend/test/rainviewer-processor.test.js backend/test/operational-data-radar-tiles.test.js; node --test frontend/src/api/weatherApi.test.js frontend/src/app/snapshotMeta.test.js frontend/src/features/weather-overlays/lib/rainviewerLayers.test.js; npm.cmd run dev:contract -- --grep map-base`; CDN 요청과 지도 표시가 유지되어야 한다.
- [ ] Structure: `npx.cmd depcruise .`; 0 error. `npx.cmd knip`; 새 operational-data/rainviewer 미사용 항목이 없어야 한다. `graphify update .`.
- [ ] Rollback drill: common GET을 제거한 이전 code에서 legacy meta가 그대로 읽히는지 확인한다.
- [ ] Commit sequence: additive `feat(data): migrate radar tile descriptor canary`; G1 뒤 cleanup `refactor(data): remove rainviewer legacy data path`

## Task 5: 일반 JSON pilot — `aviation.notam`

**Files:**
- Create: `backend/src/operational-data/families/aviation.notam.js`
- Create: `backend/schemas/operational-data/aviation.notam/v1.json`
- Create: `backend/test/operational-data-notam.test.js`
- Create: `backend/src/operational-data/dev-overrides.js`
- Create: `backend/test/operational-data-dev-overrides.test.js`
- Modify: `backend/src/processors/notam-processor.js`
- Modify: `backend/src/parsers/notam-parser.js`
- Modify: `backend/src/store.js`
- Modify: `backend/server.js:608,893,986`
- Modify: `backend/test/notam-parser.test.js`
- Modify: `backend/test/notam-processor.test.js`
- Modify: `backend/test/notam-store.test.js`
- Modify: `backend/test/notam-briefing.test.js`
- Modify: `backend/src/briefing/briefing-composer.js:102`
- Modify: `backend/src/alerts/scheduler.js:190`
- Modify: `backend/src/dev/scenario.js:14,92-115,162-173,228`
- Modify: `frontend/src/api/weatherApi.js:164,214,319`
- Modify: `frontend/src/features/notam/lib/notamGeoJson.js`
- Modify: `frontend/src/features/notam/NotamPanel.jsx`
- Modify: `frontend/src/features/airport-panel/tabs/NotamTab.jsx`

**Interfaces:**
- Consumes: common JSON adapter, current KOCA crawler/parser output
- Produces: `aviation.notam` envelope; bundle instance with stable NOTAM `record_id`

- [ ] catalog에 public/global, horizon selector, bundle granularity, NOTAM number/provider publication key, raw KML retention `none` 사유와 rawText 보존을 등록한다.
- [ ] standard retention은 기존 snapshot-store default 10개로 고정하고 10/11번째 출판 pruning, crawl 전체 실패·schema 실패에서 latest와 10개 history가 보존되는지 검증한다.
- [ ] 각 item의 기존 `id`를 `record_id`로 고정하고 valid/effective time, geometry CRS, altitude AGL/AMSL, response hash/source contract/transform version을 v1 schema로 검증한다.
- [ ] `store.save('notam')` 뒤 shadow 출판 → legacy/new data 동등성 → producer common 출판 순으로 전환한다. crawl/parse/empty-result 실패는 latest를 바꾸지 않는다.
- [ ] `/api/notam`, route briefing, altitude comparison을 common reader의 envelope를 받되 임시 legacy route는 `data`만 반환하도록 바꾼다.
- [ ] `backend/src/briefing/briefing-composer.js`와 `backend/src/alerts/scheduler.js`가 NOTAM envelope와 `record_id`를 보존하도록 바꾸고, focused briefing/alert fixture에서 source reference를 확인한다.
- [ ] 개발 시나리오용으로만 common reader 앞에 메모리 override를 적용하는 내부 `dev-overrides.js`를 둔다. NOTAM inject/reset/store-stats는 이 모듈과 common reader를 사용하고 파일·latest index는 바꾸지 않으며, production에서는 import·mount되지 않는 test를 추가한다. 이는 새 공개 출판/조회 interface가 아니다.
- [ ] frontend API·NOTAM 지도·공항 tab은 envelope를 보존하고 item 변환 때 parent `tag+instance_id+record_id`를 잃지 않도록 한다.
- [ ] G2와 정상 6시간 수집 주기 검증 뒤 legacy GET/direct store allowlist를 제거한다.
- [ ] Verify: `node --test backend/test/notam-parser.test.js backend/test/notam-processor.test.js backend/test/notam-store.test.js backend/test/notam-briefing.test.js backend/test/alert-scheduler.test.js backend/test/operational-data-notam.test.js backend/test/operational-data-dev-overrides.test.js; node --test frontend/src/features/notam/lib/notamGeoJson.test.js frontend/src/features/notam/lib/notamLayers.test.js frontend/src/features/notam/lib/notamViewModel.test.js; npm.cmd run dev:contract -- --grep "notam-and-settings|route-workflow|briefing-view"`.
- [ ] Structure/rollback: `npx.cmd depcruise .; npx.cmd knip; graphify update .`; 새 unused 없음, 이전 `/api/notam` payload rollback fixture 통과.
- [ ] Commit sequence: additive `feat(data): migrate notam json pilot`; G2 뒤 cleanup `refactor(data): remove notam legacy data path`

## Task 6: 다중 원본·부분수집 pilot — `weather.metar`

**Files:**
- Create: `backend/src/operational-data/families/weather.metar.js`
- Create: `backend/schemas/operational-data/weather.metar/v1.json`
- Create: `backend/test/operational-data-metar.test.js`
- Modify: `backend/src/processors/metar-processor.js`
- Modify: `backend/src/processors/overseas-weather-processor.js`
- Modify: `backend/src/parsers/metar-parser.js`
- Modify: `backend/src/parsers/noaa-metar-parser.js`
- Modify: `backend/src/store.js:229-295`
- Modify: `backend/server.js:595,600,883-885`
- Modify: `backend/src/alerts/scheduler.js:186-190`
- Modify: `backend/src/dev/scenario.js:14,63-69,110-115,162-173,228`
- Modify: `frontend/src/api/weatherApi.js:150,166,290-291`
- Modify: `frontend/src/app/useWeatherPolling.js`
- Modify: `frontend/src/features/map/lib/airportStationModel.js`
- Modify: `frontend/src/features/airport-panel/lib/metarViewModel.js`
- Modify: `frontend/src/features/route-briefing/lib/briefingViewModel.js`

**Interfaces:**
- Consumes: KMA IWXXM parser, NOAA JSON parser, JSON adapter
- Produces: 하나의 `weather.metar` tag와 `scope=domestic|overseas` selector별 envelope

- [ ] 국내·해외를 물리적으로 합치지 않고 기존 `metar/`와 `metar_overseas/`를 adapter 대상으로 유지한다. tag는 하나이며 provider/scope는 source_refs/selectors로 구분한다.
- [ ] raw retention은 KMA XML `none`, NOAA response JSON `none`이며 NOAA TAC는 standard record에 보존한다고 기록한다. 두 scope의 standard retention은 각각 기존 10개이고 10/11 pruning을 독립 검증한다.
- [ ] bundle granularity와 `ICAO+observation_time` record ID, 관측/발행/수집 시각, visibility/wind/cloud 단위, 국내 재구성 TAC와 NOAA 원문 TAC 차이를 schema/source contract에 기록한다.
- [ ] `mergeWithPrevious()`가 이전 항목을 `carried_forward`, 새 항목을 `current`, 전체 결과를 `partial|complete`로 표시하게 하고 전체 실패·schema 실패에서 두 scope latest가 독립적으로 유지되는 test를 추가한다.
- [ ] 두 legacy GET을 common reader 호환으로 바꾼 뒤 frontend state, map, airport panel, briefing composer와 alert scheduler가 envelope/meta/source_refs를 유지하도록 전환한다.
- [ ] 개발 시나리오의 국내·해외 METAR inject/reset/store-stats를 `dev-overrides.js`와 common reader로 전환하고 METAR에 대한 `getCached|updateCache|loadLatest` 직접 호출을 제거한다.
- [ ] `/api/snapshot-meta`에서 같은 tag의 두 selector가 서로 덮어쓰지 않는지 검증하고 G3 뒤 legacy direct 접근을 제거한다.
- [ ] Verify: `node --test backend/test/metar-tac.test.js backend/src/parsers/noaa-metar-parser.test.js backend/test/route-briefing-integration.test.js backend/test/alert-scheduler.test.js backend/test/operational-data-metar.test.js; node --test frontend/src/api/weatherApi.test.js frontend/src/app/snapshotMeta.test.js frontend/src/features/airport-panel/lib/metarViewModel.test.js; npm.cmd run dev:contract -- --grep "airport-panel|route-workflow|briefing-view"`.
- [ ] Structure/rollback: `npx.cmd depcruise .; npx.cmd knip; graphify update .`; 국내/해외 legacy fixture rollback 통과.
- [ ] Commit sequence: additive `feat(data): migrate metar multi-source pilot`; G3 뒤 cleanup `refactor(data): remove metar legacy data paths`

## Task 7: 예보시간 pilot — `weather.taf`

**Files:**
- Create: `backend/src/operational-data/families/weather.taf.js`
- Create: `backend/schemas/operational-data/weather.taf/v1.json`
- Create: `backend/test/operational-data-taf.test.js`
- Modify: `backend/src/processors/taf-processor.js`
- Modify: `backend/src/processors/overseas-weather-processor.js`
- Modify: `backend/src/parsers/taf-parser.js`
- Modify: `backend/src/parsers/noaa-taf-parser.js`
- Modify: `backend/server.js:596,601,885-887`
- Modify: `backend/src/briefing/taf-window.js`
- Modify: `backend/src/alerts/scheduler.js:186-190`
- Modify: `backend/src/dev/scenario.js:14,63-70,110-115,162-173,228`
- Modify: `frontend/src/api/weatherApi.js:151,167,292-293`
- Modify: `frontend/src/features/airport-panel/lib/tafViewModel.js`

**Interfaces:**
- Consumes: METAR에서 검증된 scope별 JSON adapter pattern
- Produces: `weather.taf` domestic/overseas envelope와 `ICAO+issue_time` record ID

- [ ] base/change_groups/timeline, issue/valid/change-period time 역할, 국내 재구성 TAC와 NOAA rawTAF, 단위를 v1 schema에 고정한다.
- [ ] raw retention은 KMA XML·NOAA response JSON `none`, NOAA rawTAF는 standard record 보존으로 기록하고 scope별 standard 10개 pruning을 검증한다.
- [ ] partial/current/carried_forward와 scope별 latest를 METAR와 같은 공통 필드로 출판하되 TAF 계산은 바꾸지 않는다.
- [ ] `/api/taf*`, ETA TAF selection, destination briefing, alert scheduler와 frontend timeline을 순차 전환한다.
- [ ] 개발 시나리오의 국내·해외 TAF inject/reset/store-stats를 `dev-overrides.js`와 common reader로 전환하고 TAF에 대한 `getCached|updateCache|loadLatest` 직접 호출을 제거한다.
- [ ] G4 뒤 두 legacy GET, store direct read, snapshot legacy key allowlist를 제거한다.
- [ ] Verify: `node --test backend/test/taf-tac.test.js backend/src/parsers/noaa-taf-parser.test.js backend/test/taf-window.test.js backend/test/route-briefing-integration.test.js backend/test/operational-data-taf.test.js; node --test frontend/src/features/airport-panel/lib/tafViewModel.test.js frontend/src/api/weatherApi.test.js; npm.cmd run dev:contract -- --grep "airport-panel|route-workflow|briefing-view"`.
- [ ] Structure/rollback: `npx.cmd depcruise .; npx.cmd knip; graphify update .`; legacy TAF fixture rollback 통과.
- [ ] Commit sequence: additive `feat(data): migrate taf forecast pilot`; G4 뒤 cleanup `refactor(data): remove taf legacy data paths`

## Task 8: 복합 model pilot — `model.kim`과 legacy 제거

**Files:**
- Create: `backend/src/operational-data/families/model.kim.js`
- Create: `backend/src/operational-data/adapters/model-grid.js`
- Create: `backend/schemas/operational-data/model.kim/v1-index.json`
- Create: `backend/schemas/operational-data/model.kim/v1-wind_field.json`
- Create: `backend/schemas/operational-data/model.kim/v1-temperature_field.json`
- Create: `backend/schemas/operational-data/model.kim/v1-cloud_field.json`
- Create: `backend/schemas/operational-data/model.kim/v1-icing_field.json`
- Create: `backend/test/operational-data-kim.test.js`
- Modify: `backend/src/processors/kim-nwp-store.js`
- Modify: `backend/src/processors/kim-nwp-model.js`
- Modify: `backend/src/processors/kim-surface-wind-processor.js`
- Modify: `backend/server.js:302-329,531-593,680-714`
- Modify: `backend/src/briefing/enroute-cross-section.js`
- Modify: `frontend/src/api/weatherApi.js:221-260`
- Modify: `frontend/src/features/weather-overlays/lib/useKimSurfaceWind.js`
- Modify: `frontend/src/features/weather-overlays/lib/useKimTemperature.js`
- Modify: `frontend/src/features/weather-overlays/lib/useKimCloudPotential.js`
- Modify: `frontend/src/features/weather-overlays/lib/useKimIcing.js`

**Interfaces:**
- Consumes: existing atomic KIM run/manifest/index/grid storage
- Produces: `model.kim` registered views `index|wind_field|temperature_field|cloud_field|icing_field`

- [ ] catalog에 selectors `model, run, forecast_hour, level`, run/field instance granularity, pressure/altitude 기준, 변수 단위, raw ASCII retention과 standard run retention 2를 등록한다.
- [ ] 기존 `kim_nwp/runs`, manifest, index, grid 위치는 옮기지 않고 model-grid adapter가 기존 JSON을 읽고 새 출판부터 envelope/hash를 연결한다. 기존 grid는 명시적 legacy reader로만 호환한다.
- [ ] view별 Zod/JSON Schema와 selector 필수 조합을 등록하고 자유 입력 view/variable, 잘못된 run/hf/level을 거부한다.
- [ ] KIM index/field 전용 GET과 네 frontend hook을 공통 reader/client로 전환하고 immutable ETag/cache 동작을 유지한다.
- [ ] common KIM이 안정된 별도 commit에서 `model.kim_surface_wind` store type, `/api/kim/surface-wind` fallback, frontend fallback 소비자를 제거한다.
- [ ] G5 뒤 KIM 수동 snapshot source와 direct model reads를 adapter 내부로 제한한다.
- [ ] Verify: `node --test backend/test/kim-nwp-store.test.js backend/test/kim-nwp-model.test.js backend/test/kim-server-index.test.js backend/test/kim-field-cache.test.js backend/test/kim-surface-wind.test.js backend/test/operational-data-kim.test.js; node --test frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js frontend/src/api/weatherApi.test.js; npm.cmd run dev:contract -- --grep "map-base|route-workflow|briefing-view"`.
- [ ] Structure/rollback: `npx.cmd depcruise .; npx.cmd knip; graphify update .`; legacy surface-wind 제거 전후 rollback fixture를 각각 통과시킨다.
- [ ] Commit: `feat(data): migrate canonical kim views`; 다음 commit `refactor(data): remove kim surface wind legacy path`

## Task 9: 기존 snapshot-store family 순차 전환

**Files:**
- Create one at a time: `backend/src/operational-data/families/weather.airport_info.js`, `weather.takeoff_forecast.js`, `weather.amos.js`, `weather.ground_forecast.js`, `environment.airport.js`, `hazard.airport_warning.js`, `hazard.airmet.js`, `hazard.sigmet.js`, `hazard.lightning.js`, `hazard.sigwx_low.js`
- Create on row 9.1, then extend one row at a time: `backend/test/operational-data-family-contracts.test.js`
- Modify: the exact producer/parser/store/API/frontend/test paths in the Tasks 9–11 family execution ledger rows for these ten tags; a path not listed there requires a plan update before editing

**Interfaces:**
- Consumes: G3에서 검증된 JSON adapter, G4 time contract
- Produces: 각 family의 catalog/schema/envelope와 common GET

각 행은 별도 branch/commit/deploy/G6 관문이며 다음 행을 같은 변경에 포함하지 않는다.

| 순서 | Family | Producer/parser | 주요 consumer·focused verification |
| --- | --- | --- | --- |
| 9.1 | `weather.airport_info` | `backend/src/processors/airport-info-processor.js`, `backend/src/parsers/airport-info-parser.js` | `backend/server.js`, `frontend/src/api/weatherApi.js`, `frontend/src/features/airport-panel/tabs/AirportInfoTab.jsx`; backend full test + `airport-panel` |
| 9.2 | `weather.takeoff_forecast` | `backend/src/processors/takeoff-forecast-processor.js`, `backend/src/parsers/takeoff-forecast-parser.js` | `backend/src/briefing/briefing-composer.js`, `backend/src/alerts/scheduler.js`, `frontend/src/features/route-briefing/BriefingView.jsx`; `backend/test/route-briefing-integration.test.js` + `briefing-view` |
| 9.3 | `weather.amos` | `backend/src/processors/amos-processor.js`, `backend/src/parsers/amos-parser.js` | `frontend/src/shared/weather/amosViewModel.js`, `AmosTab.jsx`, briefing; AMOS tests + `airport-panel|briefing-view` |
| 9.4 | `environment.airport` | `backend/src/processors/environment-processor.js` | `frontend/src/api/weatherApi.js`, `frontend/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx`; backend/frontend full test + `monitoring` |
| 9.5 | `weather.ground_forecast` | `backend/src/processors/ground-forecast-processor.js` | `frontend/src/api/weatherApi.js`, `frontend/src/features/monitoring/legacy/components/GroundForecastPanel.jsx`, `frontend/src/features/monitoring/legacy/components/GroundHourlyStrip.jsx`; backend/frontend full test + `monitoring` |
| 9.6 | `hazard.airport_warning` | `backend/src/processors/warning-processor.js`, `backend/src/parsers/warning-parser.js` | `frontend/src/features/airport-panel/WarningCarousel.jsx`, `backend/src/briefing/briefing-composer.js`, `backend/src/alerts/scheduler.js`; briefing integration + `airport-panel|briefing-view` |
| 9.7 | `hazard.airmet` | `backend/src/processors/airmet-processor.js`, `backend/src/parsers/airmet-parser.js`, `backend/src/parsers/iwxxm-advisory-parser.js` | `backend/src/briefing/hazard-section.js`, `backend/src/briefing/route-exposure.js`, `backend/src/alerts/scheduler.js`, `frontend/src/features/weather-overlays/lib/advisoryLayers.js`; hazard/route tests + `map-base|briefing-view` |
| 9.8 | `hazard.sigmet` | `backend/src/processors/sigmet-processor.js`, `backend/src/processors/overseas-weather-processor.js`, `backend/src/parsers/sigmet-parser.js`, `backend/src/parsers/iwxxm-advisory-parser.js`, `backend/src/parsers/noaa-sigmet-parser.js` | `backend/src/briefing/hazard-section.js`, `backend/src/briefing/route-exposure.js`, `backend/src/alerts/scheduler.js`, `frontend/src/features/weather-overlays/lib/advisoryLayers.js`; hazard/route tests + `map-base|briefing-view` |
| 9.9 | `hazard.lightning` | `backend/src/processors/lightning-processor.js`, `backend/src/parsers/lightning-parser.js` | `frontend/src/features/weather-overlays/lib/lightningLayers.js`, `backend/src/briefing/route-exposure.js`; exposure tests + `map-base|route-workflow` |
| 9.10 | `hazard.sigwx_low` | `backend/src/processors/sigwx-low-processor.js`, `backend/src/parsers/sigwx-low-parser.js`, `DATA_PATH/sigwx_low/`, `DATA_PATH/sigwx_fronts/`, `DATA_PATH/sigwx_clouds/` | `frontend/src/api/weatherApi.js`, `frontend/src/features/weather-overlays/lib/sigwxData.js`; backend/frontend SIGWX tests + `map-base` |

- [ ] 각 행에서 catalog metadata, v1 Zod/JSON Schema, provider/transform record, current retention, fixture를 먼저 추가한다.
- [ ] 각 행에서 shadow → legacy/new 동등성 → common reader → internal/frontend consumer → legacy 제거 다섯 배포 단계를 모두 수행한다.
- [ ] 각 행에서 `npm.cmd test; npm.cmd run build; npx.cmd depcruise .; npx.cmd knip; graphify update .`를 실행하고 새 family 경로의 unused/direct I/O가 0이어야 한다.
- [ ] 각 행의 listed Playwright contract를 실행하고 결과를 status에 기록한다.

## Task 10: artifact·dedicated store·on-demand family 순차 전환

**Files:**
- Create one at a time: `backend/src/operational-data/families/imagery.radar.js`, `imagery.satellite.js`, `model.ktg.js`, `traffic.adsb.js`, `traffic.callsign_route.js`
- Create when first needed: `backend/src/operational-data/adapters/local-artifact.js`
- Modify one row at a time: `backend/test/operational-data-family-contracts.test.js`
- Modify: the exact processor/store/route/frontend/test paths in the Tasks 9–11 family execution ledger rows for these five tags

**Interfaces:**
- Consumes: artifact descriptor and model-grid adapters
- Produces: local file hash-verified descriptors, KTG views, on-demand envelopes

| 순서 | Family | Actual storage/route | 완료 검증 |
| --- | --- | --- | --- |
| 10.1 | `imagery.radar` | `radar-echo-processor.js` PNG + `radar/echo_meta.json`, `/api/radar/echo-meta` | descriptor hash=실제 PNG SHA-256, `map-base` |
| 10.2 | `imagery.satellite` | `satellite-processor.js` WebP + `satellite/sat_meta.json`, `/api/satellite/meta` | descriptor hash=실제 WebP SHA-256, `map-base` |
| 10.3 | `model.ktg` | `ktg-store.js` index/latest/grid, `/api/ktg/index|grid` | index/grid view selector·run retention, `map-base|briefing-view` |
| 10.4 | `traffic.adsb` | `adsb-processor.js` direct latest, on-demand `/api/adsb` | request-time publish/latest and stale fallback, `map-base` |
| 10.5 | `traffic.callsign_route` | `backend/server.js` adsbdb proxy·6시간 memory cache, `frontend/src/features/aviation-layers/flightInfo.js`; 새 JSON snapshot은 `DATA_PATH/callsign_route/instances/`, latest는 전용 `DATA_PATH/operational-data/latest/traffic.callsign_route.json` | selector `callsign`, 한 lookup 경계, provider response/hash; memory hit은 disk write 없음, provider miss 성공만 출판; standard TTL 6시간+최대 1,000건, raw `none`; 사용자/session 식별정보 저장 금지; common GET 안정 뒤에만 `/api/adsb/route/:callsign` 제거; `node --test backend/test/operational-data-callsign-route.test.js; npm.cmd run dev:contract -- --grep map-base` |

- [ ] local artifact는 ProjectAMO 보관 bytes hash를 descriptor와 대조하고, external ADS-B provider 응답은 raw retention `none`과 response hash를 기록한다.
- [ ] callsign lookup은 shared 6시간 자료이므로 현재 승인된 ephemeral 정의로 재분류하지 않는다. 기존 memory cache를 첫 조회 경로로 유지해 hit에는 파일·index write를 하지 않고, provider cache miss의 성공 결과만 JSON snapshot adapter로 출판한다.
- [ ] catalog standard retention을 TTL 6시간+최대 1,000 instance로 고정한다. 서버 시작과 provider miss 출판 직전에 만료 instance와 latest selector를 제거하고, cap 초과 시 가장 오래된 instance부터 원자적으로 정리하는 주체를 JSON adapter에 둔다. 임시 디렉터리 fixture에서 expired/active 혼합과 1,000/1,001 경계를 검증한다.
- [ ] callsign shard write는 다른 tag queue와 독립이고 같은 callsign 동시 miss는 한 provider 요청·한 instance로 합쳐지는지 검증한다. 30개 서로 다른 callsign을 동시에 출판하는 동안 METAR fixture 출판이 기다리지 않는 concurrency test를 추가한다.
- [ ] envelope·파일명·latest entry에는 callsign/provider/fetched time만 두고 user ID, session ID, 요청 IP와 화면 행동정보를 넣지 않는다. 개인정보 관련 key가 들어오면 schema가 거부하는 test를 추가한다.
- [ ] `/api/adsb/route/:callsign`은 checkpoint 4와 rollback window까지 producer compatibility route로 유지한다. frontend가 `GET /api/data/traffic.callsign_route?schema_version=1&callsign=KAL123`을 안정적으로 사용하고 memory hit·provider miss·expired fallback이 모두 검증된 cleanup commit에서만 전용 route를 제거하며 memory cache 자체는 제거하지 않는다.
- [ ] 각 행을 별도 commit/deploy하고 G6, full test/build, depcruise, knip, graph update, listed browser contract를 통과시킨다.

## Task 11: checked-in static family 순차 등록

**Files:**
- Create: `backend/src/operational-data/adapters/static-reference.js`
- Create one at a time: `backend/src/operational-data/families/aviation.airport.js`, `aviation.navpoint.js`, `aviation.airspace.js`, `aviation.airway.js`, `aviation.procedure.js`, `aviation.aip.js`, `terrain.dem.js`, `geography.boundary.js`, `reference.warning_type.js`, `reference.alert_default.js`
- Modify: the exact producer/static-source/consumer/test paths in the Tasks 9–11 family execution ledger rows for these ten tags
- Modify: `scripts/build_enroute_navdata.py`, `scripts/build_aip_review_snapshot.py`, `scripts/validate_aip_review_snapshot.py`, `scripts/prepare-terrain-tiles.js`
- Create: `backend/test/operational-data-static.test.js`
- Modify one row at a time: `backend/test/operational-data-family-contracts.test.js`

**Interfaces:**
- Consumes: checked-in/build output files and manifests
- Produces: server-start/build validation and static envelope reads without scheduler/runtime copy

| 순서 | Family | Instance boundary / source |
| --- | --- | --- |
| 11.1 | `reference.warning_type` | one project reference table / `shared/warning-types.js` |
| 11.2 | `reference.alert_default` | one project reference table / `shared/alert-defaults.js` |
| 11.3 | `aviation.airport` | scope별 airport collection / `shared/airports.js`, overseas airport JSON |
| 11.4 | `geography.boundary` | boundary dataset publication / `frontend/public/Geo/` |
| 11.5 | `aviation.navpoint` | source/publication별 point collection / navdata GeoJSON |
| 11.6 | `aviation.airspace` | publication·airspace kind collection / aviation WFS GeoJSON |
| 11.7 | `aviation.airway` | active publication en-route view / `frontend/public/data/navdata/enroute.json`, `frontend/public/data/airways.geojson`, `frontend/public/data/airways-overseas.geojson` |
| 11.8 | `aviation.procedure` | airport·procedure kind publication / procedure JSON |
| 11.9 | `aviation.aip` | raw/reviewed/active representation과 manifest / `backend/data/aip/` |
| 11.10 | `terrain.dem` | source/scope/tile boundary / backend terrain manifests·tiles |

- [ ] static adapter는 build/server 시작 시 schema/source publication/effective time/hash를 검증하고 runtime 복사본이나 scheduler를 만들지 않는다.
- [ ] 각 행의 shadow 단계에서 현재 checked-in bytes를 common static envelope로 읽은 결과와 기존 정적 URL JSON을 동등 비교한다. 다음 배포에서 해당 frontend consumer를 `fetchOperationalData()`로 전환하고, 그 family의 `/data/**` 또는 `/Geo/**` 직접 URL만 제거한다. 이전 정적 파일은 rollback window 동안 그대로 두며 다음 family 전환과 함께 삭제하지 않는다.
- [ ] `reference.warning_type|reference.alert_default`는 `frontend/src/features/monitoring/monitoringApi.js`, `aviation.airport`는 `frontend/src/api/weatherApi.js`·`frontend/src/features/route-briefing/lib/routePlanner.js`·`frontend/src/features/aviation-layers/aviationWfsLayers.js`, `geography.boundary`는 `frontend/src/features/map/lib/baseMapLayers.js`, `aviation.navpoint|airspace|airway`는 `frontend/src/features/aviation-layers/aviationWfsLayers.js`와 `frontend/src/features/route-briefing/lib/routePlanner.js`, `aviation.procedure`는 `frontend/src/features/route-briefing/lib/procedureData.js`, `aviation.aip`는 `backend/src/briefing/aip-airway-constraints.js`, `terrain.dem`은 `backend/src/terrain/terrain-cache.js`·`backend/src/terrain/terrain-sampler.js`의 직접 read를 각 행에서 제거한다.
- [ ] `aviation.navdata`는 전역 tag로 만들지 않고 airport/navpoint/airspace/airway/procedure의 build 내부 이름으로만 남긴다.
- [ ] 각 행을 별도 commit으로 등록하고 `node --test backend/test/operational-data-static.test.js; npm.cmd test; npm.cmd run build; npx.cmd depcruise .; npx.cmd knip; graphify update .`를 통과시킨다.
- [ ] 지도/공항/경로 영향을 받는 행은 각각 `map-base`, `airport-panel`, `route-workflow` contract를 실행한다.

### Tasks 9–11 family 실행 ledger

아래 행은 Tasks 9–11의 authoritative file/contract 목록이다. 모든 행은 기존 경로를 checkpoint 4까지 보존하고, listed focused test와 browser contract가 통과한 뒤 cleanup commit에서만 제거한다. JSON snapshot의 `standard 10`은 `config.storage.max_files_per_category`, `48`과 `12`는 `max_files_by_type`, image/model 값은 기존 `config` 값을 그대로 옮긴 것이다.

| Family | Exact files and legacy path to remove | Selector · instance boundary · provider key | Retention / completeness / data movement | Exact verification |
| --- | --- | --- | --- | --- |
| `weather.airport_info` | `backend/src/processors/airport-info-processor.js`, `backend/src/parsers/airport-info-parser.js`, `backend/src/store.js`, `DATA_PATH/airport_info/latest.json`, `backend/server.js` `/api/airport-info`, `frontend/src/api/weatherApi.js`, `frontend/src/features/airport-panel/tabs/AirportInfoTab.jsx` | `scope=domestic`; airport bundle; airport+bulletin/fetched time | raw XML `none`; standard 10; airport별 실패는 `partial/carried_forward`, 전체 실패 latest 불변; bulk move 없음 | `node --test backend/test/airport-info-processor.test.js backend/test/operational-data-publisher.test.js; npm.cmd run dev:contract -- --grep airport-panel` |
| `weather.takeoff_forecast` | `backend/src/processors/takeoff-forecast-processor.js`, `backend/src/parsers/takeoff-forecast-parser.js`, `backend/src/store.js`, `DATA_PATH/takeoff_fcst/latest.json`, `backend/server.js` `/api/takeoff-fcst`, `backend/src/briefing/briefing-composer.js`, `backend/src/alerts/scheduler.js`, `backend/src/dev/scenario.js`, `frontend/src/features/route-briefing/BriefingView.jsx` | `scope=domestic`; airport bundle; ICAO+`tmFc` | raw XML `none`; standard 10; airport별 `partial/current/carried_forward`, 전체 실패 latest 불변; bulk move 없음 | `node --test backend/test/takeoff-forecast-parser.test.js backend/test/briefing-composer.test.js backend/test/route-briefing-integration.test.js backend/test/operational-data-dev-overrides.test.js; npm.cmd run dev:contract -- --grep briefing-view` |
| `weather.amos` | `backend/src/processors/amos-processor.js`, `backend/src/parsers/amos-parser.js`, `backend/src/store.js`, `DATA_PATH/amos/latest.json`, `backend/server.js` `/api/amos`, `backend/src/dev/scenario.js`, `frontend/src/api/weatherApi.js`, `frontend/src/shared/weather/amosViewModel.js`, `frontend/src/features/airport-panel/tabs/AmosTab.jsx` | `scope=domestic`; airport observation bundle; ICAO+observation time | full raw text `none`, selected raw fields retained; standard 10; missing airport가 있을 때 partial/current/carried_forward, 전체 실패 latest 불변 | `npm.cmd --prefix backend test -- --test-name-pattern=amos; node --test backend/test/operational-data-dev-overrides.test.js frontend/src/shared/weather/amosViewModel.test.js; npm.cmd run dev:contract -- --grep "airport-panel|briefing-view"` |
| `environment.airport` | `backend/src/processors/environment-processor.js`, `backend/src/store.js`, `DATA_PATH/environment/latest.json`, `backend/server.js` `/api/environment`, `frontend/src/api/weatherApi.js`, `frontend/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx` | provider+airport selector; airport collection; provider+ICAO+observed/fetched time | provider responses `none`; standard 10; provider/airport fallback를 current/carried_forward로 표시하고 partial, 전체 실패 latest 불변 | `node --test frontend/src/api/weatherApi.test.js; npm.cmd --prefix backend test; npm.cmd run dev:contract -- --grep monitoring` |
| `weather.ground_forecast` | `backend/src/processors/ground-forecast-processor.js`, `backend/src/store.js`, `DATA_PATH/ground_forecast/latest.json`, `backend/server.js` `/api/ground-forecast`, `frontend/src/api/weatherApi.js`, `frontend/src/features/monitoring/legacy/components/GroundForecastPanel.jsx`, `frontend/src/features/monitoring/legacy/components/GroundHourlyStrip.jsx` | airport+forecast kind selector; airport forecast bundle; base date/time+forecast time | upstream JSON `none`; standard 10; airport/kind별 partial/current/carried_forward, 전체 실패 latest 불변 | `node --test backend/test/ground-forecast-hourly.test.js frontend/src/api/weatherApi.test.js; npm.cmd run dev:contract -- --grep monitoring` |
| `hazard.airport_warning` | `backend/src/processors/warning-processor.js`, `backend/src/parsers/warning-parser.js`, `backend/src/store.js`, `DATA_PATH/warning/latest.json`, `backend/server.js` `/api/warning`, `backend/src/briefing/briefing-composer.js`, `backend/src/alerts/scheduler.js`, `backend/src/dev/scenario.js`, `frontend/src/features/airport-panel/WarningCarousel.jsx` | `scope=domestic`; warning collection; warning ID+issued/valid time | source XML `none`, raw_message retained; standard 10; single-source failure latest 불변, record status current | `node --test backend/test/briefing-composer.test.js backend/test/route-briefing-integration.test.js backend/test/operational-data-dev-overrides.test.js; npm.cmd run dev:contract -- --grep "airport-panel|briefing-view"` |
| `hazard.airmet` | `backend/src/processors/airmet-processor.js`, `backend/src/parsers/airmet-parser.js`, `backend/src/parsers/iwxxm-advisory-parser.js`, `backend/src/store.js`, `DATA_PATH/airmet/latest.json`, `backend/server.js` `/api/airmet`, `backend/src/briefing/hazard-section.js`, `backend/src/briefing/route-exposure.js`, `backend/src/alerts/scheduler.js`, `backend/src/dev/scenario.js`, `frontend/src/features/weather-overlays/lib/advisoryLayers.js` | `scope=domestic`; advisory collection; advisory ID+issue/valid time | IWXXM XML `none`; standard 10; whole fetch failure latest 불변, partial only when parser reports rejected records | `node --test backend/test/hazard-section.test.js backend/test/hazard-exposure.test.js backend/test/hazard-matcher.test.js backend/test/operational-data-dev-overrides.test.js; npm.cmd run dev:contract -- --grep "map-base|briefing-view"` |
| `hazard.sigmet` | `backend/src/processors/sigmet-processor.js`, `backend/src/processors/overseas-weather-processor.js`, `backend/src/parsers/sigmet-parser.js`, `backend/src/parsers/iwxxm-advisory-parser.js`, `backend/src/parsers/noaa-sigmet-parser.js`, `backend/src/store.js`, `DATA_PATH/sigmet/latest.json`, `DATA_PATH/sigmet_overseas/latest.json`, `backend/server.js` `/api/sigmet` and `/api/sigmet-overseas`, `backend/src/briefing/hazard-section.js`, `backend/src/briefing/route-exposure.js`, `backend/src/alerts/scheduler.js`, `backend/src/dev/scenario.js`, `frontend/src/features/weather-overlays/lib/advisoryLayers.js` | `scope=domestic|overseas`; advisory collection; advisory ID+issue/valid time | KMA XML/NOAA response `none`, NOAA raw text retained; standard 10 per scope; rejected/previous live records mark partial/current/carried_forward | `node --test backend/src/parsers/noaa-sigmet-parser.test.js backend/test/hazard-section.test.js backend/test/hazard-exposure.test.js backend/test/route-briefing-integration.test.js backend/test/operational-data-dev-overrides.test.js; npm.cmd run dev:contract -- --grep "map-base|briefing-view"` |
| `hazard.lightning` | `backend/src/processors/lightning-processor.js`, `backend/src/parsers/lightning-parser.js`, `backend/src/store.js`, `DATA_PATH/lightning/latest.json`, `backend/server.js` `/api/lightning`, `backend/src/briefing/route-exposure.js`, `frontend/src/features/weather-overlays/lib/lightningLayers.js` | area/time selector; strike collection; provider ID or time+lat+lon tuple | source text `none`; standard 48; page/area 일부 실패 partial/current/carried_forward, total failure latest 불변; prune 48/49 test | `node --test backend/test/hazard-exposure.test.js backend/test/route-briefing-integration.test.js; npm.cmd run dev:contract -- --grep "map-base|route-workflow"` |
| `hazard.sigwx_low` | `backend/src/processors/sigwx-low-processor.js`, `backend/src/parsers/sigwx-low-parser.js`, `backend/src/store.js`, `DATA_PATH/sigwx_low/latest.json`, `DATA_PATH/sigwx_fronts/`, `DATA_PATH/sigwx_clouds/`, `backend/server.js` `/api/sigwx-low`, `/api/sigwx-front-meta`, `/api/sigwx-cloud-meta`, `frontend/src/api/weatherApi.js`, `frontend/src/features/weather-overlays/lib/sigwxData.js` | `tmfc` selector; chart run; `tmfc` | source XML `none`; standard 12 plus local artifact hash; run parse/render 일부 실패 partial, total failure latest 불변; prune 12/13 test | `npm.cmd --prefix backend test -- --test-name-pattern=sigwx; npm.cmd --prefix frontend test -- --test-name-pattern=sigwx; npm.cmd run dev:contract -- --grep map-base` |
| `imagery.radar` | `backend/src/processors/radar-echo-processor.js`, `backend/src/parsers/radar-echo-parser.js`, `DATA_PATH/radar/echo_*.png`, `DATA_PATH/radar/echo_meta.json`, `backend/server.js` `/api/radar/echo-meta`, `frontend/src/api/weatherApi.js` `/data/radar/echo_meta.json`, `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` | `scope=domestic`; frame descriptor list; latest frame `tm` | gzip grid `none`; PNG/descriptor 36; missing frame partial, all new frames fail keeps previous meta; bytes stay in place | `npm.cmd --prefix backend test -- --test-name-pattern=radar; node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js; npm.cmd run dev:contract -- --grep map-base` |
| `imagery.satellite` | `backend/src/processors/satellite-processor.js`, `backend/src/parsers/satellite-parser.js`, `DATA_PATH/satellite/sat_*.webp`, `DATA_PATH/satellite/sat_meta.json`, `backend/server.js` `/api/satellite/meta`, `frontend/src/api/weatherApi.js` `/data/satellite/sat_meta.json`, `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` | product/scope selector; frame descriptor list; latest request/display time | NetCDF/HDF5 `none`; WebP/descriptor 18; missing frame partial, total failure preserves meta; bytes stay in place | `npm.cmd --prefix backend test -- --test-name-pattern=satellite; node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js; npm.cmd run dev:contract -- --grep map-base` |
| `model.ktg` | `backend/src/processors/ktg-processor.js`, `backend/src/processors/ktg-model.js`, `backend/src/processors/ktg-store.js`, `DATA_PATH/ktg/index.json`, `DATA_PATH/ktg/latest.json`, `DATA_PATH/ktg/runs/`, `backend/server.js` `/api/ktg/index` and `/api/ktg/grid`, `backend/src/briefing/enroute-cross-section.js`, `frontend/src/features/weather-overlays/lib/useKtgTurbulence.js` | views `index|grid`; run+forecast hour+altitude selectors; run/hf/altitude field | source NetCDF `none`; standard 2 usable runs; incomplete run must not evict latest, prune 2/3; grids stay in place | `node --test backend/test/altitude-weather-comparison.test.js backend/test/enroute-model.test.js; npm.cmd run dev:contract -- --grep "map-base|briefing-view"` |
| `traffic.adsb` | `backend/src/processors/adsb-processor.js`, `backend/src/store.js`, `DATA_PATH/adsb/latest.json`, `backend/server.js` `/api/adsb`, `backend/src/dev/scenario.js`, `frontend/src/api/adsbApi.js`, `frontend/src/features/aviation-layers/addAdsbLayer.js` | `scope=RKRR`; one observation snapshot; provider timestamp | provider JSON `none`; standard latest 1; incomplete response rejected, stale prior retained; first common write only, no bulk move | `node --test backend/test/adsb-processor.test.js backend/test/adsb-scheduler.test.js backend/test/operational-data-dev-overrides.test.js frontend/src/features/aviation-layers/addAdsbLayer.test.js; npm.cmd run dev:contract -- --grep map-base` |
| `traffic.callsign_route` | `backend/server.js` adsbdb memory cache and `/api/adsb/route/:callsign`, `frontend/src/features/aviation-layers/flightInfo.js`; new `DATA_PATH/callsign_route/instances/`, `DATA_PATH/operational-data/latest/traffic.callsign_route.json` | callsign selector; one lookup; provider+callsign+fetched time; no principal/session key | provider JSON `none`; memory hit write 없음, provider miss success만 standard 출판; TTL 6h+cap 1,000, startup/publish prune; first common write only, no bulk move | `node --test backend/test/operational-data-callsign-route.test.js backend/test/operational-data-publisher.test.js; npm.cmd run dev:contract -- --grep map-base` |
| `reference.warning_type` | `shared/warning-types.js`, `backend/server.js` `/api/warning-types`, `frontend/src/features/monitoring/monitoringApi.js` | no selector; full table; source revision+hash | source/static standard retained with source control, no runtime copy; build validation all-or-fail | `node --test backend/test/api-cache-policy.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep monitoring` |
| `reference.alert_default` | `shared/alert-defaults.js`, `backend/server.js` `/api/alert-defaults`, `frontend/src/features/monitoring/monitoringApi.js` | no selector; full table; source revision+hash | same static retention; all-or-fail | `node --test backend/test/api-cache-policy.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep monitoring` |
| `aviation.airport` | `scripts/generate_overseas_airports.py`, `shared/airports.js`, `frontend/public/data/airports.geojson`, `frontend/public/data/airports-overseas.geojson`, `frontend/public/data/navdata/airports.json`, `frontend/public/data/navdata/airports-overseas.json`, `backend/server.js` `/api/airports`, `frontend/src/api/weatherApi.js`, `frontend/src/features/route-briefing/lib/routePlanner.js`, `frontend/src/features/aviation-layers/aviationWfsLayers.js` | `scope=domestic|overseas`, view `index|geojson`; airport collection; publication+ICAO | checked-in source/standard retained while referenced; build partial forbidden; files wrapped in place | `node --test backend/test/overseas-config.test.js frontend/src/features/route-briefing/lib/routePlanner.enroute.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep "airport-panel|map-base|route-workflow"` |
| `geography.boundary` | `frontend/public/Geo/sido.json`, `sigungu.json`, `korea_neighbors_masked.v1.geojson`, `scripts/prepare-land-water-mask.js`, `frontend/src/features/map/lib/baseMapLayers.js` | boundary kind selector; one publication per kind; source revision+hash | checked-in static retention; any missing layer fails build; files wrapped in place | `node --test frontend/src/features/map/lib/baseMapLayers.test.js frontend/src/features/map/lib/mapStyleSync.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep map-base` |
| `aviation.navpoint` | `scripts/build_enroute_navdata.py`, `scripts/generate_overseas_navdata.py`, `frontend/public/data/waypoints.geojson`, `frontend/public/data/waypoints-overseas.geojson`, `frontend/public/data/navaids.geojson`, `frontend/public/data/navaids-overseas.geojson`, `frontend/public/data/navdata/enroute.json`, `frontend/public/data/navdata/navpoints-overseas.json`, `frontend/src/features/aviation-layers/aviationWfsLayers.js`, `frontend/src/features/route-briefing/lib/routePlanner.js` | scope+point kind+publication selectors; point collection; publication+point ID | checked-in static retention; build partial forbidden; files wrapped in place | `node --test frontend/src/features/route-briefing/lib/routePlanner.enroute.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep "map-base|route-workflow"` |
| `aviation.airspace` | `frontend/public/data/fir.geojson`, `frontend/public/data/fir-overseas.geojson`, `frontend/public/data/sectors.geojson`, `frontend/public/data/ctr.geojson`, `frontend/public/data/tma.geojson`, `frontend/public/data/restricted.geojson`, `frontend/public/data/prohibited.geojson`, `frontend/public/data/danger.geojson`, `backend/src/briefing/airspace-zones.js`, `frontend/src/features/aviation-layers/aviationWfsLayers.js` | scope+airspace kind+publication; collection per kind; publication+feature ID | checked-in static retention; any required file/feature invalid fails build | `node --test backend/test/airspace-zones.test.js frontend/src/features/map/layerActions.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep "map-base|route-workflow"` |
| `aviation.airway` | `scripts/build_enroute_navdata.py`, `scripts/generate_overseas_navdata.py`, `frontend/public/data/navdata/enroute.json`, `frontend/public/data/navdata/route-graph-overseas.json`, `frontend/public/data/navdata/route-segments-overseas.json`, `frontend/public/data/navdata/routes-overseas.json`, `frontend/public/data/airways.geojson`, `frontend/public/data/airways-overseas.geojson`, `frontend/src/features/route-briefing/lib/routePlanner.js`, `frontend/src/features/aviation-layers/aviationWfsLayers.js` | scope+publication+view `planner|geojson`; airway collection; publication+segment ID | checked-in static retention; planner/geojson ID mismatch fails build | `node --test frontend/src/features/route-briefing/lib/routePlanner.enroute.test.js backend/test/aip-airway-constraints.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep "map-base|route-workflow"` |
| `aviation.procedure` | `frontend/public/data/navdata/procedures/`, `frontend/src/features/route-briefing/lib/procedureData.js`, `frontend/src/features/route-briefing/lib/routePlanner.js` | airport+procedure kind+publication; airport procedure collection; publication+procedure ID | checked-in static retention; missing wrapper/ID fails build | `node --test frontend/src/features/route-briefing/lib/rkthProcedureData.test.js frontend/src/features/route-briefing/lib/recommendProcedures.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep route-workflow` |
| `aviation.aip` | `scripts/build_aip_review_snapshot.py`, `scripts/validate_aip_review_snapshot.py`, `scripts/run_aip_airway_operations.py`, `backend/data/aip/raw/`, `backend/data/aip/normalized/`, `backend/data/aip/current/`, `backend/data/aip/validation/`, `backend/src/briefing/aip-airway-constraints.js` | publication+representation `provider_raw|standard`; publication snapshot; publication/effective/version | raw/reviewed/active files retained while referenced; activation all-or-rollback; no move | `python scripts/validate_aip_review_snapshot.py; node --test backend/test/aip-airway-constraints.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep route-workflow` |
| `terrain.dem` | `scripts/prepare-terrain-tiles.js`, `scripts/prepare_overseas_terrain_tiles.py`, `scripts/generate_terrain_manifest.py`, `backend/data/terrain/overseas-tile-manifest.json`, `backend/data/terrain/tiles/metadata.json`, `backend/data/terrain/tiles/`, `backend/src/terrain/terrain-cache.js`, `backend/src/terrain/terrain-sampler.js`, `backend/server.js` `/api/terrain/elevation` | scope+source+tile selector; one tile; source version+tile coordinates | source/tile manifests retained by current data-root policy; missing/corrupt tile yields explicit unavailable, no fabricated clear; no move | `node --test backend/test/vertical-profile.test.js backend/test/vfr-leg-terrain.test.js backend/test/operational-data-static.test.js; npm.cmd run dev:contract -- --grep route-workflow` |

- [ ] Each ledger row must add a named case to `backend/test/operational-data-family-contracts.test.js` using the exact tag as the test name. The case asserts the stated raw/standard retention value or `none` reason, boundary provider key, completeness mode, total-failure latest preservation, provider-contract→transform→standard fixture validation, and removal of only the listed legacy path.
- [ ] Multi-record families that cannot carry forward individual records must assert `complete` or reject the whole publication; they must not label unverified mixed data as `complete`.
- [ ] Cleanup rollback for every row is deployment of its immediately preceding additive commit while the listed legacy file/route still exists; the focused command in the row must pass before and after the drill.

## Task 12: 브리핑 family를 ephemeral interface로 전환

**Files:**
- Create one at a time: `backend/src/operational-data/families/briefing.vertical_profile.js`, `briefing.weather_cross_section.js`, `briefing.route_exposure.js`, `briefing.altitude_comparison.js`, `briefing.route.js`
- Create: `backend/test/operational-data-ephemeral-briefing.test.js`
- Modify: `backend/server.js:860-1011`, including `/api/briefing/route-exposure/batch`
- Modify: `backend/src/briefing/vertical-profile.js`, `backend/src/briefing/enroute-cross-section.js`, `backend/src/briefing/route-exposure.js`, `backend/src/briefing/altitude-weather-comparison.js`, `backend/src/briefing/briefing-composer.js`, `backend/src/briefing/briefing-provenance.js`
- Modify: `backend/test/route-briefing-integration.test.js`, `backend/test/briefing-provenance.test.js`
- Modify: `frontend/src/api/briefingApi.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify: `frontend/src/features/route-briefing/lib/briefingViewModel.js`

**Interfaces:**
- Consumes: `createEphemeralOperationalEnvelope()` and parent source envelopes
- Produces: five request-bound briefing envelopes; no publisher/storage/latest/GET path

- [ ] 현재 POST 계산은 모두 catalog `lifecycle=ephemeral`, backend-only 또는 해당 기능 접근 수준으로 선언하고 `publishOperationalData()`가 이 entry를 거부하도록 한다.
- [ ] 다섯 family 모두 raw/standard retention `none`과 “요청별 비공유 결과” 사유를 등록하고, provider/source parent는 source_refs만 유지한다.
- [ ] POST `/api/vertical-profile`, `/api/route-briefing`, `/api/briefing/route-exposure`, `/api/briefing/route-exposure/batch`, `/api/briefing/altitudes`, `/api/briefing/cross-section`이 schema-validated envelope를 반환하도록 순서대로 전환한다. batch는 각 요청 결과를 별도 `briefing.route_exposure` envelope로 반환하고 batch 자체를 새 family로 만들지 않는다.
- [ ] `briefing.route_axis`, `briefing.flight_profile`, `briefing.enroute_weather`, `briefing.hazard_exposure`, `briefing.notam_exposure`, `briefing.aip_constraints`, `briefing.altitude_candidates`는 별도 tag 없이 다섯 family schema의 내부 field/module contract로 귀속한다.
- [ ] 직접 사용한 source `tag+instance_id+record_id`만 source_refs에 연결하고 전체 조상을 복사하지 않는다.
- [ ] 단건과 batch 요청 전후 `DATA_PATH`와 모든 latest shard를 비교해 변화가 없고 route coordinates가 `GET /api/data/{tag}`로 조회되지 않으며 ephemeral tag GET이 거부되는 test를 추가한다. `backend/test/route-briefing-integration.test.js`의 batch fixture도 같은 무저장·source_refs 조건을 검사한다.
- [ ] 실제 재사용·공유 producer가 생기기 전에는 stored briefing adapter를 만들지 않는다. 이후 필요하면 같은 schema를 쓰되 별도 stored lifecycle 결정을 승인받는다.
- [ ] Verify: `node --test backend/test/operational-data-ephemeral-briefing.test.js backend/test/route-briefing-integration.test.js backend/test/briefing-provenance.test.js; node --test frontend/src/features/route-briefing/lib/briefingViewModel.test.js; npm.cmd run dev:contract -- --grep "route-workflow|briefing-view"`.
- [ ] Structure/rollback: `npx.cmd depcruise .; npx.cmd knip; graphify update .`; POST legacy payload adapter rollback 통과.
- [ ] Commit: family별로 `feat(data): wrap briefing vertical profile as ephemeral envelope`, `feat(data): wrap briefing weather cross section as ephemeral envelope`, `feat(data): wrap briefing route exposure as ephemeral envelope`, `feat(data): wrap briefing altitude comparison as ephemeral envelope`, `feat(data): wrap route briefing as ephemeral envelope`

## Task 13: `alert.triggered` principal/SQLite 무손실 분리

**Files:**
- Create: `backend/src/operational-data/families/alert.triggered.js`
- Create: `backend/src/operational-data/adapters/sqlite-principal.js`
- Create: `backend/test/operational-data-alert-triggered.test.js`
- Modify: `backend/src/db/schema.sql:77-110`
- Modify: `backend/src/db/index.js:8-47`
- Modify: `backend/src/alerts/scheduler.js:116-152`
- Modify: `backend/src/alerts/sender.js:98-125`
- Modify: `backend/src/me/alerts.js:107-145`
- Modify: `backend/test/db.test.js`
- Modify: `backend/test/alert-scheduler.test.js`
- Modify: `backend/test/alert-sender.test.js`
- Modify: `backend/test/me-notifications.test.js`
- Modify: `frontend/src/features/notifications/useNotifications.js`
- Modify: `frontend/src/features/notifications/NotificationCenter.jsx`
- Modify: `frontend/src/features/notifications/FlightAlertDetail.jsx`
- Modify: `frontend/src/features/notifications/notificationFormat.js`
- Create: `frontend/verification/contracts/notifications.spec.mjs`

**Interfaces:**
- Consumes: `publishOperationalData()` with server-internal principalId, session-authenticated reader
- Produces: immutable `alert.triggered` occurrence, mutable internal `alert.notification_feed`, `alert.delivery`

- [ ] `alert.triggered` v1 data를 occurrence 사실만 담는 immutable schema로 정의하고 principal/authenticated, detected time·route selector, route/briefing source_refs를 등록한다. principal 범위는 selector가 아니라 session에서 별도로 주입한다.
- [ ] raw retention은 `none`, standard occurrence retention은 현재 정책과 같은 자동 만료 없음으로 등록하고 feed/delivery 갱신·route 만료가 occurrence를 자동 삭제하지 않는 fixture를 추가한다.
- [ ] 새 occurrence storage에 immutable envelope와 query index를 두고 `alert_notification_feed(alert_id,user_id,read_at)`, `alert_delivery(alert_id,channel,pushed_at,status_json)`를 별도 table로 만든다.
- [ ] 한 transaction에서 기존 `triggered_alerts` occurrence, `read_at`, `pushed_at`, `channel_status`를 새 세 구조로 backfill하고 row count, null/value, user ownership을 대조한다. 실패 시 전체 rollback한다.
- [ ] scheduler는 occurrence 출판+feed insert를 기존 baseline snapshot update와 같은 transaction에 넣고, sender는 delivery만, me alerts는 feed만 수정하도록 전환한다.
- [ ] 한 배포 동안 old/new dual-read 비교 후 old mutable column write를 중단하고 SQLite table rebuild로 legacy mutable columns를 제거한다. 기존 dedup/history는 occurrence data로 보존한다.
- [ ] public latest index에서 principal entry를 제외하고 authenticated session user의 SQLite latest만 조회한다. query/payload principal ID는 거부한다.
- [ ] 사용자 A/B 교차 GET/index/read/delivery가 모두 차단되고 read/delivery 변경 후 occurrence `content_hash`가 같음을 test한다.
- [ ] Playwright `notifications` contract는 격리된 두 로그인 context를 만들고 사용자 A의 알림 목록·상세 열기·읽음 반영·새로고침 후 유지, 사용자 B에게 A의 알림·미읽음 수가 노출되지 않음을 검증한다. DB rollback fixture로 구버전 dual-read를 켠 상태에서도 같은 사용자 동작을 한 번 더 실행한다.
- [ ] 저장 route geometry, alert registration UX, baseline/회복·재악화 동작은 변경하지 않는다.
- [ ] Verify: `node --test backend/test/db.test.js backend/test/alert-scheduler.test.js backend/test/alert-sender.test.js backend/test/me-notifications.test.js backend/test/operational-data-alert-triggered.test.js; npm.cmd test; npm.cmd run dev:contract -- --grep notifications`.
- [ ] Structure/rollback: migration 전 DB fixture 백업에서 upgrade→rollback drill, `npx.cmd depcruise .; npx.cmd knip; graphify update .`.
- [ ] Commit: `feat(data): split immutable alert occurrence from feed delivery state`

## Task 14: suspended family와 명시적 비대상 정리

**Files:**
- Create: `backend/src/operational-data/families/weather.flight_category_overlay.js`
- Create: `backend/test/operational-data-flight-category-overlay.test.js`
- Modify: `backend/src/processors/flight-category-processor.js`
- Modify: `backend/src/config.js:168-177,279,285-289`
- Modify: `backend/src/store.js:10-49,136`
- Modify: `backend/src/index.js:110-155`
- Modify: `backend/server.js:784-820`
- Modify: `frontend/src/features/weather-overlays/lib/useFlightCategory.js`
- Modify: `frontend/src/features/weather-overlays/lib/flightCategoryLayers.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/app/snapshotMeta.js`
- Modify: `backend/src/processors/flight-category-processor.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js`
- Modify: `backend/test/operational-data-catalog.test.js`
- Modify: `backend/test/operational-data-structure.test.js`

**Interfaces:**
- Produces: suspended catalog entry and preserved common read path without scheduler

- [ ] `weather.flight_category_overlay`를 `suspended`, selector `scope=domestic`, instance boundary “한 계산 시각의 전국 category/query-grid 묶음”으로 등록한다. provider key는 KMA 지상시정 `tm` + CTPS `tm` + `weather.amos` source instance이고, 시정 부재는 publication 거부, CTPS/AMOS 일부 부재는 `partial`과 source별 unavailable을 기록한다.
- [ ] raw SFC text와 CTPS NetCDF/HDF input retention은 `none`, standard snapshot retention은 현재 기본값 10으로 등록한다. `backend/src/processors/flight-category-processor.test.js` fixture로 provider-contract→transform→v1 standard, 10/11 pruning, total-failure latest 불변을 검증한다.
- [ ] checkpoint 1에서 scheduler를 켜지 않은 채 `DATA_PATH/flight_category_overlay/latest.json`을 legacy file adapter로 읽어 common envelope를 shadow 생성하고 payload·fetched/computed time·feature/query-grid count를 비교한다. 파일이 없으면 명시적 unavailable을 반환하며 빈 정상값을 만들지 않는다.
- [ ] checkpoint 2에서 기존 latest 한 건만 Task 2의 공통 규칙에 맞는 `DATA_PATH/flight_category_overlay/instances/`로 원자 복사·hash 검증하고 common latest index를 갱신한다. 원본 `DATA_PATH/flight_category_overlay/latest.json`과 기존 history는 rollback window 동안 그대로 두며 bulk history 이동과 신규 수집은 하지 않는다.
- [ ] checkpoint 3에서 `backend/server.js`의 `/api/weather/flight-category-overlay`와 `/api/weather/flight-category-overlay/point` 구현만 common reader의 data-only compatibility adapter로 바꾸고, old/new 응답 및 ETag가 같은지 검증한다.
- [ ] checkpoint 4에서 `frontend/src/features/weather-overlays/lib/useFlightCategory.js`를 `fetchOperationalData('weather.flight_category_overlay', { scope: 'domestic' })`와 common latest change 신호로 전환한다. `frontend/src/app/snapshotMeta.js`의 legacy `flightCategory` hash 분기를 제거하되 `WeatherOverlayPanel.jsx`의 임시 숨김과 `backend/src/index.js`의 시작/cron 주석은 유지한다.
- [ ] checkpoint 5 cleanup에서 전용 두 API, `backend/src/store.js`의 `flight_category_overlay` type/cache mapping, `backend/server.js`의 수동 snapshot source만 제거한다. old data directory는 rollback window 만료 뒤 별도 cleanup commit에서만 제거한다.
- [ ] rollback은 checkpoint 4의 frontend/API adapter commit으로 재배포하고 보존한 `DATA_PATH/flight_category_overlay/latest.json`을 읽는 것이다. 각 checkpoint에서 `node --test backend/test/operational-data-flight-category-overlay.test.js backend/src/processors/flight-category-processor.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js; npm.cmd test; npm.cmd run build; npx.cmd depcruise .; npx.cmd knip; graphify update .; npm.cmd run dev:contract -- --grep map-base`를 통과해야 하며, G6 실패 시 다음 checkpoint로 가지 않는다.
- [ ] `weather.ground_overview`가 catalog와 generated schema에 없음을 검증하고 기존 고아 경로 제거/생산 연결은 별도 작업으로 남긴다.
- [ ] `model.kim_surface_wind`가 catalog/route/store/frontend에 없고 `model.kim` consumer 전환이 완료됐는지 검사한다.
- [ ] 다음 15 internal 이름이 catalog에 없고 담당 family/module에 귀속됐는지 exact expected-list test로 고정한다: `aviation.navdata`, `system.snapshot_meta`, `briefing.route_axis`, `briefing.flight_profile`, `briefing.enroute_weather`, `briefing.hazard_exposure`, `briefing.notam_exposure`, `briefing.aip_constraints`, `briefing.altitude_candidates`, `alert.active_flight`, `alert.monitor_snapshot`, `alert.change`, `alert.notification_feed`, `alert.delivery`, `alert.monitoring_browser`.
- [ ] `alert.active_flight`는 `backend/src/alerts/scheduler.js`의 `activeFlights()`/`pickActiveFlight()` 내부 contract, `alert.monitor_snapshot`은 같은 파일의 `buildSnapshot()`과 `routes.last_briefing_snapshot_json`, `alert.change`는 `backend/src/alerts/diff.js`의 return schema, `alert.monitoring_browser`는 `frontend/src/features/monitoring/legacy/utils/alerts/alert-engine.js`의 local-only schema로 귀속하고 각각 기존 focused test에 “catalog tag가 아님”과 parent/source reference 유지 assertion을 추가한다.
- [ ] `system.snapshot_meta`는 Task 2의 latest index 구현 이름일 뿐 tag가 아니며, `alert.notification_feed`와 `alert.delivery`는 Task 13의 mutable projection table/interface이고 `alert.triggered` source instance를 참조한다고 catalog absence test에 기록한다.
- [ ] Verify: `node --test backend/test/operational-data-catalog.test.js backend/test/operational-data-structure.test.js; npm.cmd test; npm.cmd run build; npm.cmd run dev:contract -- --grep map-base`.
- [ ] Commit: `feat(data): register suspended flight category contract`

## Task 15: 최종 catalog 완전성·직접 접근 제거·문서 동기화

**Files:**
- Modify: `backend/test/operational-data-catalog.test.js`
- Modify: `backend/test/operational-data-structure.test.js`
- Modify: `backend/server.js`
- Modify: `backend/src/store.js`
- Modify: `frontend/src/api/weatherApi.js`
- Modify: `frontend/src/app/useWeatherPolling.js`
- Modify: `frontend/src/app/snapshotMeta.js`
- Modify: `Architecture.md`
- Modify: `docs/policies/index.md`
- Modify: `docs/policies/engineering/data-and-time.md`
- Modify: `docs/policies/engineering/route-briefing-source-contract.md`
- Modify: `CONTEXT.md` only if implementation terminology differs from the approved glossary; otherwise leave unchanged

**Interfaces:**
- Consumes: 모든 완료 family와 G1-G8 evidence
- Produces: 최종 36 active + 1 suspended catalog, zero legacy allowlist, 실제 구조와 일치하는 문서

- [ ] catalog exact-set test에 승인된 36 active와 1 suspended를 고정하고 중복, 누락, extra tag, 필요한 view/schema/fixture/provider/retention/access/ownership 누락을 실패시킨다.
- [ ] structure allowlist를 0으로 줄여 common module adapter 밖의 운영 데이터 직접 write/read, `latest.json` 소비, 명찰 없는 JSON 운영 데이터 응답, frontend `/data/` 직접 읽기를 실패시킨다.
- [ ] `/api/snapshot-meta`의 수작업 `SNAPSHOT_SOURCES`와 legacy key 출력을 제거하고 common latest entries만 남긴다.
- [ ] 임시 전용 GET과 payload-only frontend adapter를 제거해 최종 state에서 envelope가 map/airport/briefing/alert consumer까지 유지되는지 검증한다.
- [ ] `Architecture.md` File Roles/Reference Structure와 두 data 정책에 실제 catalog/schema/publisher/reader 위치, family 추가 절차, ephemeral/principal/artifact 규칙을 기록한다.
- [ ] Verify contracts: `npm.cmd --prefix backend run data:schemas; npm.cmd test; npm.cmd run build`; 모두 pass.
- [ ] Verify structure: `npx.cmd depcruise .`; 0 error. `npx.cmd knip`; 새/변경 module 미사용 0이며 기존 baseline noise만 남음. `git diff --check`; pass. `graphify update .`; graph 갱신 성공.
- [ ] Verify browser: `npm.cmd run dev:contract -- --grep "responsive-baseline|map-base|monitoring|airport-panel|notam-and-settings|route-import|route-workflow|briefing-view|notifications"`; 모든 등록 project pass.
- [ ] Verify rollback: 마지막 전환 family의 이전 commit에서 해당 legacy adapter가 보존 데이터로 정상 기동·조회되고, 현재 commit 재적용 뒤 instance ID/hash가 바뀌지 않아야 한다.
- [ ] Commit: `docs(data): align architecture and operational contract policy`

## Requirement / Success Criteria Traceability

| Spec | Planned verification |
| --- | --- |
| FR-001–FR-005 | Tasks 1, 9–14 exact catalog set과 internal/non-goal tests |
| FR-006–FR-012 | Tasks 1–3 catalog/schema generation, unsupported version test, no conversion registry check |
| FR-012A | Task 12 ephemeral no-write/no-index/no-GET/coordinate test |
| FR-013–FR-022 | Task 2 envelope identity tests; Tasks 4–13 family schema/source/time/unit/record tests |
| FR-023–FR-030 | Tasks 2–3 common publisher/reader/HTTP/frontend; family cutover and final zero legacy allowlist |
| FR-031–FR-035 | Tasks 6–10 partial/current/carried_forward/latest retention/raw-none tests |
| FR-036–FR-038 | Tasks 2–3 generated latest index; Task 15 manual snapshot list removal; no event history module |
| FR-039–FR-040 | Tasks 4–14 family exact-set and suspended preservation |
| FR-041 | Task 8 separate legacy surface-wind removal commit and rollback test |
| FR-042 | Task 14 ground_overview absence test; no implementation change |
| FR-043 | G1–G9, five-deployment choreography, per-family commits and rollback drills |
| FR-044 | Task 13 immutable occurrence/feed/delivery migration and hash test |
| FR-045–FR-047 | Tasks 1, 3, 15 catalog admission, generated schema, structure zero-allowlist tests |
| FR-048 | Task 15 Architecture/policy/procedure synchronization |
| SC-001–SC-004 | Tasks 1, 4–14 exact catalog, generated schemas, provider conversion fixtures |
| SC-005–SC-006 | Tasks 2, 4–13 envelope/artifact hash/record/source reference tests |
| SC-007 | Tasks 6–10 partial/retention/raw-none/latest-preservation tests |
| SC-007A | Task 12 filesystem/index/GET isolation test |
| SC-008 | Tasks 2–3 v1 success/unsupported version/no-registry tests |
| SC-009 | Tasks 2–3 selector latest index/access tests and Task 13 principal isolation |
| SC-010 | Every G6 gate plus Task 15 direct I/O zero-allowlist and rollback evidence |
| SC-011 | Tasks 8 and 14 legacy removal/suspended state tests |
| SC-012 | Task 15 full contract, structure, build, browser, Architecture/policy verification |
| SC-013 | Task 13 state migration and occurrence hash immutability tests |

## Completion Rule

G0부터 순서대로 진행하되, 한 관문의 focused test, full affected test, 구조 검사, 필요한 Playwright contract, rollback drill이 모두 성공한 기록이 status에 없으면 다음 관문을 시작하지 않는다. 구현 도중 승인된 spec의 scope·family·보안 경계가 바뀌어야 한다면 구현을 멈추고 새 승인을 받는다.
