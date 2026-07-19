# Spec: ProjectAMO 공통 운영 데이터 규격

**Status:** Approved
**Created:** 2026-07-19

## Problem / Goal

ProjectAMO의 기상·위험·항공·모델·브리핑·알림 데이터는 수집기, 저장 폴더, API 주소, 프런트엔드 상태와 계산 코드에 서로 다른 이름과 모양으로 연결되어 있다. 새 데이터나 기능을 추가할 때마다 실제 저장 위치, 필드 의미, 시각·단위, 원본과 소비자를 다시 추적해야 하며, 규격 변경이 기존 기능을 조용히 깨뜨릴 수 있다.

이 작업의 목표는 모든 운영 데이터에 안정적인 태그와 버전된 규격을 부여하고, 원본 수신부터 저장·API·프런트엔드·브리핑·알림까지 하나의 공통 계약으로 연결하는 것이다. 최종 구조에서는 생산자가 공통 출판 관문을 통하고 소비자가 태그 기반으로 조회하므로, 새 데이터와 기능을 기존 저장 구현을 다시 조사하지 않고 연결할 수 있어야 한다.

근거 문서:

- 현황 조사: `docs/superpowers/specs/refs/2026-07-19-project-data-tag-inventory.md`
- 프로젝트 공통 용어: `CONTEXT.md`
- 데이터·시간 정책: `docs/policies/engineering/data-and-time.md`

## Requirements

### 1. 적용 범위와 태그

- **FR-001:** 시스템은 기상, 위험, 항공·지형·참조자료, 수치모델, 재사용 가능한 브리핑 산출물과 발생 알림을 **운영 데이터**로 관리해야 한다.
- **FR-002:** 사용자 계정, 인증 세션, 화면 설정, 방문 기록, Web Push 구독과 한 화면 내부에서만 쓰는 임시 표시값은 이 공통 운영 데이터 규격의 대상에서 제외해야 한다.
- **FR-003:** 태그는 `<분야>.<자료>` 두 칸 형식을 사용해야 하며 제공자, 국내·해외 범위, 저장 위치, 처리 단계와 규격 버전을 태그 이름에 넣지 않아야 한다.
- **FR-004:** 별도 태그는 독립적으로 생성·조회되거나 독자적인 규격, 원본 또는 유효기간을 가져야 하는 데이터 family에만 부여해야 한다. 상위 산출물 내부에서만 쓰는 중간값은 상위 규격의 필드 또는 담당 모듈의 내부 규격으로 관리해야 한다.
- **FR-005:** 국내·해외 범위, 공항, 모델 실행시각, 예보시간, 고도와 영역은 태그가 아니라 카탈로그가 선언한 조회 조건으로 구분해야 한다.

### 2. 카탈로그와 규격 원본

- **FR-006:** 각 독립 태그는 설명, 상태, 현재 규격 버전, 허용 조회 조건, 시간·공간 의미, 단위, 신선도 기준, 원본·표준 데이터 보존 정책, 외부 공개 수준, 소유 범위와 인스턴스 경계(`instance_granularity`)·제공자 식별키 구성을 가진 카탈로그 항목을 소유해야 한다. 소유 범위는 기본값인 전체 공용 `global`과 로그인 사용자별로 격리하는 `principal`을 구분해야 한다. 인스턴스 경계는 한 상자가 공항별 관측 묶음, 레이더 frame 목록, 모델 run의 특정 예보시간·고도 field 중 무엇을 담는지 선언해야 한다.
- **FR-007:** 카탈로그의 허용 상태는 최소한 `active`, `suspended`, `deprecated`를 포함해야 한다. 실제 생산자가 없거나 계획만 있는 항목은 `active`로 등록할 수 없어야 한다.
- **FR-008:** 외부 자료마다 제공자 원본의 필드, 형식, 단위, 시간 의미와 판본을 설명하는 **제공자 원본 규격**을 버전별로 보존해야 한다. 제공자가 XSD 등 공식 규격을 제공하면 그 판본 또는 검증 가능한 원본 참조도 함께 보존해야 한다.
- **FR-009:** ProjectAMO가 생산·저장·전달하는 데이터 모양은 **ProjectAMO 표준 규격**으로 정의해야 한다. 실행 가능한 기준 원본은 기존 백엔드 의존성인 Zod를 사용하고, 동일 정의에서 버전별 JSON Schema를 자동 생성해야 한다.
- **FR-010:** 제공자 원본 규격을 ProjectAMO 표준 규격으로 바꾸는 변환은 입력 원본 규격, 출력 태그·규격과 필드·단위·시각 변환 의미를 가진 독립적인 버전 기록으로 보존해야 한다.
- **FR-011:** 표준 규격 버전은 `1`, `2`, `3`과 같은 증가하는 정수를 사용해야 한다. 필드, 자료형, 필수 여부, 단위, 시간·공간 의미 또는 계산 결과의 의미가 달라지면 이전 정의를 수정하지 않고 새 버전을 추가해야 한다. 데이터 모양과 의미가 그대로인 변환 구현 변경은 변환 규칙 버전만 증가시켜야 한다.
- **FR-012:** 공통 조회는 소비자가 지원하는 규격 버전을 확인하고 지원하지 않는 버전을 추측해 변환하지 않고 명확하게 거부해야 한다. 현재 모든 공통 규격이 최초 v1이므로 범용 전진 변환 등록 체계는 만들지 않아야 한다. 최초 v2를 도입하는 family가 구버전 호환을 필요로 할 때 저장된 v1을 덮어쓰지 않는 명시적 v1→v2 변환과 검증을 그 변경에 함께 추가해야 한다.
- **FR-012A:** 로그인 없이 요청마다 즉석 계산되는 브리핑처럼 재사용·공유되지 않는 결과는 카탈로그에서 반드시 `ephemeral`로 선언해야 한다. `ephemeral` 결과는 표준 규격 검증과 데이터 상자를 적용하지만 저장, 최신 인스턴스 색인, `GET /api/data/{tag}` 공개 조회와 보존 대상에서는 제외해야 한다. 요청에 포함된 경로 좌표 등 입력값을 운영 데이터로 축적해서는 안 된다.

### 3. 공통 데이터 상자와 식별

- **FR-013:** 모든 운영 데이터 인스턴스는 저장소, 내부 모듈, API와 프런트엔드 흐름에서 `{ meta, data }` 공통 상자를 유지해야 한다.
- **FR-014:** `meta`는 최소한 `tag`, `schema_version`, `representation`, `instance_id`, `content_hash`, `selectors`, `time`, `source_refs`를 포함해야 한다. 데이터 성격상 적용되지 않는 선택 시각·공간·변환 항목은 생략할 수 있어야 한다.
- **FR-015:** `representation`은 제공자 원본, ProjectAMO 표준, 파생 또는 정적 참조자료 중 해당 데이터의 표현 역할을 카탈로그가 정한 값으로 식별해야 한다. 같은 태그와 표현 역할 안에 서로 다른 반환 모양이 둘 이상인 경우에만 카탈로그가 허용 `view`, view별 Zod 규격과 필수 조회 조건을 등록해야 하며, 요청자는 등록되지 않은 자유 입력 view를 사용할 수 없어야 한다.
- **FR-016:** 모든 인스턴스는 `tag`, `schema_version`, `representation`, 적용되는 `view`, 정규화된 조회 조건·제공자 식별키와 `content_hash`를 담은 정규 식별 문서에 SHA-256을 적용해 생성한 `instance_id`를 가져야 한다. `instance_id`는 서로 다른 태그·버전·조회 의미를 구분하는 주소이고 `content_hash`는 그 계산 재료 중 하나다. 같은 의미·내용의 인스턴스는 저장 위치와 전달 경로가 달라도 같은 ID를 유지하고, 같은 제공자 시각이라도 내용이 수정되면 다른 ID를 가져야 한다.
- **FR-017:** 모든 인스턴스는 정규화된 표준 `data` 또는 ProjectAMO가 보관하는 파일·격자·이미지 artifact bytes에 SHA-256을 적용한 `content_hash`를 가져야 한다. `content_hash`는 내용 동일성과 변경 여부를 판단하는 지문이며 전역 주소인 `instance_id`와 같지 않다. 외부 CDN처럼 ProjectAMO가 보관하지 않는 artifact 자체는 인스턴스로 취급하지 않고, 이를 가리키는 표준 설명서 데이터를 인스턴스로 출판해 그 설명서의 hash를 기록해야 한다. 수집 시각, 계산된 신선도와 저장 위치 같은 변동 메타정보는 내용 hash를 불필요하게 바꾸지 않아야 한다.
- **FR-018:** 여러 항목이 들어 있는 인스턴스 안에서 다른 기능이 독립적으로 참조하는 항목은 공항+관측시각, 공고번호, 경보 식별자 같은 자연 식별정보로 안정적인 `record_id`를 가져야 한다. 필드, 격자 셀과 이미지 픽셀에는 ID를 부여하지 않아야 한다.
- **FR-019:** 외부 원본에서 생성된 인스턴스는 제공자 원본 규격·버전, 제공자 식별키, 수집 시각과 보존 원본 또는 응답 hash를 `source_refs`에 기록해야 한다.
- **FR-020:** 파생 인스턴스는 직접 사용한 상위 인스턴스의 `tag + instance_id`와 필요한 경우 `record_id`를 `source_refs`에 기록해야 한다. 모든 조상을 반복 복사하지 않고 참조를 단계적으로 따라갈 수 있어야 한다.
- **FR-021:** 모든 시각은 역할을 구분해 기록하고 비교 가능한 순간은 UTC 또는 epoch로 저장해야 한다. 표시 시간대 변환은 기존 프로젝트 시간 정책에 따라 사용자에게 보여주는 경계에서 수행해야 한다.
- **FR-022:** 필드 단위와 공간·수직 기준은 해당 버전의 표준 규격과 카탈로그에 명시되어야 한다. 데이터가 좌표를 가질 때 CRS를, 고도를 가질 때 AGL·AMSL·FL 등 기준면을 생략해서는 안 된다.

### 4. 공통 출판·조회 모듈

- **FR-023:** 모든 운영 데이터 생산자는 하나의 공통 출판 interface를 사용해야 한다. 출판은 태그·규격·조회 조건 등록 확인, Zod 검증, 명찰·ID·hash 생성, 보존 정책에 맞는 저장과 최신 인스턴스 색인 갱신을 한 관문에서 수행해야 한다.
- **FR-024:** JSON 스냅샷, 대용량 격자, 이미지·binary artifact, 정적 참조자료와 계산 산출물은 서로 다른 저장 adapter를 사용할 수 있어야 한다. JSON 조회는 공통 상자를 반환하고, 이미지·binary bytes는 공통 상자의 `data`가 가리키는 URL로 상자 없이 전달할 수 있어야 한다. artifact 설명서는 최소한 URL과 media type을 가지며, ProjectAMO가 보관하는 artifact는 실제 파일의 `content_hash`도 연결해야 한다. 코드·저장소에 포함된 정적 참조자료는 별도 scheduler나 runtime 복사본을 만들지 않고 build 또는 server 시작 시 규격·출처·판본·hash를 검증하는 정적 adapter로 출판할 수 있어야 한다.
- **FR-025:** 규격 검증에 실패하거나 전체 수집이 실패한 결과는 출판하지 않아야 하며 마지막 사용 가능한 정상 인스턴스를 유지해야 한다.
- **FR-026:** 모든 운영 데이터 소비자는 파일 경로, `latest.json`, 개별 cache와 전용 저장 코드를 직접 읽지 않고 `tag + 조회 조건 + 지원 규격 버전`을 사용하는 공통 조회 interface를 거쳐야 한다.
- **FR-027:** 공통 조회는 요청한 태그, 등록된 view와 조회 조건을 검증하고, 적합한 인스턴스를 찾고, 필요한 전진 변환과 목표 view 규격 검증을 수행한 뒤 전체 데이터 상자를 반환해야 한다.
- **FR-028:** 이미 출판된 운영 데이터의 HTTP 읽기는 `GET /api/data/{tag}`와 카탈로그에 등록된 view·조회 조건으로 제공해야 한다. 카탈로그의 공개 수준에 따라 public, 인증 사용자 또는 backend-only 접근을 강제해야 한다. 소유 범위가 `principal`인 자료의 사용자 식별값은 요청 query나 payload에서 받지 않고 인증된 서버 세션에서 주입해야 하며, 저장·최신 인스턴스 색인·조회에서 사용자별로 격리해야 한다.
- **FR-029:** 브리핑 계산·사용자 저장·수정처럼 새로운 결과나 상태를 만드는 기능별 POST·PUT·PATCH·DELETE endpoint는 유지할 수 있지만, 운영 데이터 결과를 반환할 때는 공통 데이터 상자를 반환해야 한다.
- **FR-030:** 프런트엔드의 공통 데이터 모듈은 `{ meta, data }`를 보존해 지도, 공항 화면, 브리핑과 알림에 전달해야 한다. 최종 구조에서 명찰을 영구적으로 제거해 기존 payload만 전달하는 호환층을 남겨서는 안 된다.

### 5. 완전성, 상태와 보존

- **FR-031:** 여러 항목을 수집하는 family는 이번 수집이 전부 성공한 `complete`인지 일부만 성공한 `partial`인지 공통 수집 완전성으로 표시해야 한다.
- **FR-032:** 부분 실패 때 이전 정상 레코드를 이어 쓰는 경우 해당 레코드는 `carried_forward`, 이번에 확보한 레코드는 `current`로 표시해야 한다. 기존 자료와 새 자료를 구분 없이 섞어서는 안 된다.
- **FR-033:** `fresh`, `stale`, `expired` 자료 신선도는 카탈로그의 family별 허용시간과 데이터 시각을 현재 시각과 비교해 조회 시 계산해야 한다. 시간 경과로 바뀌는 신선도를 인스턴스의 불변 내용 hash에 포함해서는 안 된다.
- **FR-034:** 각 태그는 제공자 원본과 ProjectAMO 표준 데이터의 보존 방식·한도를 각각 명시해야 한다. 최초 전환은 현재 사용 중인 보존량을 기본값으로 옮기고, 모든 family에 하나의 보존 기간을 강제하지 않아야 한다.
- **FR-035:** 제공자 원본을 저장하지 않는 family도 `none`과 그 이유를 명시하고 제공자, 수집 시각, 원본 규격 버전과 가능한 응답 hash를 남겨야 한다. 규격·변환과 v2 도입 이후 실제로 추가된 명시적 전진 변환 정의는 과거 인스턴스를 읽을 수 있도록 계속 보존해야 한다.

### 6. 최신 인스턴스 색인

- **FR-036:** 현재 `/api/snapshot-meta`의 수작업 목록은 공통 출판 결과에서 자동 생성되는 최신 인스턴스 색인으로 대체해야 한다.
- **FR-037:** 최신 인스턴스 색인은 태그와 카탈로그가 선언한 조회 조건 조합별로 최신 정상 인스턴스의 ID, 내용 hash, 규격 버전과 주요 시각을 제공해야 한다. 국내·해외 자료나 KIM 실행시각·예보시간·고도가 같은 태그 아래 서로 덮어쓰지 않아야 한다.
- **FR-038:** 이번 범위에서는 모든 출판 순서를 저장하는 중앙 변경 이력, 이벤트 재생과 exactly-once 처리를 만들지 않아야 한다. 각 데이터의 과거 인스턴스는 tag별 보존 정책으로 관리해야 한다.

### 7. 기존 데이터 전환과 정리

- **FR-039:** 아래 36개 active 독립 family와 1개 suspended family는 각각 카탈로그, 표준 규격, 필요한 제공자 원본 규격·변환, 출판 adapter, 조회 adapter와 계약 검증을 가져야 한다.
- **FR-040:** `weather.flight_category_overlay`는 수집 일정이 꺼진 `suspended` 상태로 유지해야 한다. processor·API·지도 기능은 보존하되 공통 규격과 출판·조회 경로로 전환해 향후 수집 일정만 다시 켤 수 있어야 한다.
- **FR-041:** legacy 호환 자료 `model.kim_surface_wind`와 그 전용 저장·API·소비 경로는 제거하고 소비자를 `model.kim`의 조회 조건과 표준 규격으로 전환해야 한다.
- **FR-042:** 생산자가 없는 `weather.ground_overview`는 카탈로그에 등록하거나 가짜 규격을 만들지 않아야 한다. 관련 죽은 배관의 제거 또는 실제 생산 연결은 별도 작업으로 유지해야 한다.
- **FR-043:** 전환 중에는 기존 저장·API adapter를 일시적으로 사용할 수 있지만, 각 family는 다른 family와 독립적으로 배포·검증·되돌릴 수 있어야 하며 전환 완료 시 해당 임시 adapter와 직접 접근을 제거해야 한다. 공통 모듈 이후 소수의 대표 family를 먼저 종단 간 전환해 중간 관문을 통과한 뒤 나머지를 순차 전환해야 하며, 구체적인 pilot 목록과 순서는 후속 구현 계획에서 정해야 한다. 최종 상태에 태그 없는 병행 체계를 남겨서는 안 된다.
- **FR-044:** `alert.triggered`의 표준 데이터는 알림이 발생한 사실만 담는 불변 인스턴스여야 한다. 사용자별 `read_at`은 `alert.notification_feed`, 채널별 `pushed_at`과 `channel_status`는 `alert.delivery`의 변경 가능한 상태로 논리·저장 규격과 변경 경로를 분리해야 하며, 기존 행의 상태를 손실 없이 이관해야 한다.

#### Active 독립 family 36개

```text
weather.metar
weather.taf
weather.airport_info
weather.takeoff_forecast
weather.amos
weather.ground_forecast
environment.airport

hazard.sigmet
hazard.airmet
hazard.airport_warning
hazard.lightning
hazard.sigwx_low

imagery.radar
imagery.radar_tiles
imagery.satellite

model.kim
model.ktg

aviation.notam
traffic.adsb
traffic.callsign_route

aviation.airport
aviation.navpoint
aviation.airspace
aviation.airway
aviation.procedure
aviation.aip
terrain.dem
geography.boundary
reference.warning_type
reference.alert_default

briefing.vertical_profile
briefing.weather_cross_section
briefing.route_exposure
briefing.altitude_comparison
briefing.route
alert.triggered
```

#### Suspended 독립 family 1개

```text
weather.flight_category_overlay
```

#### 전역 태그를 만들지 않는 하위·내부 자료 15개

```text
aviation.navdata
system.snapshot_meta

briefing.route_axis
briefing.flight_profile
briefing.enroute_weather
briefing.hazard_exposure
briefing.notam_exposure
briefing.aip_constraints
briefing.altitude_candidates

alert.active_flight
alert.monitor_snapshot
alert.change
alert.notification_feed
alert.delivery
alert.monitoring_browser
```

### 8. 강제와 검증

- **FR-045:** 신규 active 또는 suspended family는 카탈로그 등록, Zod 표준 규격, 생성 가능한 JSON Schema, 필요한 원본 규격·변환, 보존 정책, 조회 조건, 공개 수준·소유 범위와 예제 또는 fixture가 없으면 추가할 수 없어야 한다. 반환 모양이 둘 이상인 family는 view별 규격과 필수 조회 조건도 가져야 한다.
- **FR-046:** 자동 검증은 태그 중복, 규격 버전 덮어쓰기, 잘못된 전진 변환 연결, 예제 데이터 검증 실패, 미등록 tag·view 출판과 명찰 없는 운영 데이터 응답을 실패로 처리해야 한다.
- **FR-047:** 구조 검증은 생산자의 직접 파일 저장과 소비자의 직접 저장소 읽기를 공통 데이터 모듈 밖에서 허용하지 않아야 한다. 예외가 필요한 binary·격자 저장은 공통 모듈 내부 adapter로 등록해야 한다.
- **FR-048:** 프로젝트의 `Architecture.md`, 데이터 정책과 신규 데이터 작업 절차는 공통 출판·조회 interface, 규격 위치와 family 추가 절차를 최종 구조와 같은 변경에서 갱신해야 한다.

## Non-Goals (out of scope)

- `routes.payload`의 최초 버전, 과거 저장 경로 변환과 DB migration ledger 구현. 별도 사용자 경로 호환 스펙에서 다룬다.
- 알림 baseline 영속화, 회복·재발 상태, 중복 제거 수명과 재알림 동작 수정. 별도 알림 신뢰성 스펙에서 다룬다.
- `ground_overview`의 실제 생산자 추가 또는 죽은 API·프런트 경로 삭제.
- Web Push를 실제 경로 알림 발송 채널에 연결하거나 사용자 구독 UI를 완성하는 작업.
- 사용자 계정, 세션, 저장 경로, 화면 설정과 방문 기록을 운영 데이터 카탈로그로 옮기는 작업.
- 모든 외부 원본을 영구 보존하거나 하나의 보존 기간을 강제하는 작업.
- 메시지 브로커, 별도 schema registry 서버, 중앙 출판 이력, 이벤트 재생과 exactly-once 처리 도입.
- 브리핑 계산식, 위험 판단 기준, 알림 내용과 화면 디자인 자체를 변경하는 작업.

위 첫 두 작업은 범위 밖으로 폐기하거나 공통 규격 전환 뒤로 미루는 항목이 아니다. 각각의 별도 스펙과 수정·검증을 완료한 뒤 공통 규격의 대규모 family 전환을 시작해야 하는 선행조건이다.

## Success Criteria

- **SC-001:** 36개 active family와 `weather.flight_category_overlay`가 각각 중복 없는 태그, 상태, 조회 조건, 인스턴스 경계·제공자 식별키 구성, 보존·신선도·접근·소유 정책과 표준 규격을 카탈로그에 가지며, 필요한 family만 등록된 view별 규격을 가진다.
- **SC-002:** 15개 하위·내부 자료가 별도 전역 태그 없이 상위 규격 또는 담당 모듈 내부 규격에 귀속되고, `model.kim_surface_wind`와 `ground_overview`가 승인된 처리 상태와 일치한다.
- **SC-003:** 모든 표준 규격 버전과 등록된 view가 Zod 검증과 자동 생성 JSON Schema를 가지며, 저장된 이전 버전 정의가 변경 없이 보존된다. v2 이후 실제로 추가된 명시적 전진 변환도 변경 없이 보존된다.
- **SC-004:** 제공자 fixture에서 표준 데이터까지의 변환 테스트가 원본·표준 규격과 변환 버전을 검증하고, 잘못된 입력·단위·시간·공간 기준을 출판 전에 차단한다.
- **SC-005:** 모든 active·suspended 운영 데이터의 저장 결과와 JSON HTTP 응답이 유효한 `{ meta, data }` 상자이며, ID·hash·규격·조회 조건·시각·원본 또는 상위 참조를 가진다. 이미지·binary bytes는 유효한 artifact 설명서가 가리키는 URL로 전달되고, ProjectAMO가 보관하는 파일은 설명서의 hash와 실제 파일 hash가 일치한다.
- **SC-006:** 여러 항목이 있는 METAR·TAF·SIGMET·NOTAM 등에서 독립 항목을 `record_id`로 참조하고, 브리핑 결과에서 실제 사용한 상위 인스턴스·레코드까지 역추적할 수 있다.
- **SC-007:** 부분 수집 실패 검증에서 마지막 정상 레코드가 `carried_forward`로 유지되고 전체 상태가 `partial`로 표시되며, 전체 실패·규격 실패는 최신 정상 인스턴스를 대체하지 않는다. 카탈로그가 선언한 원본·표준 데이터 보존 한도와 `none` 사유, 보존된 원본 규격·변환 정의도 검증한다.
- **SC-007A:** `ephemeral` 브리핑 fixture는 유효한 데이터 상자를 반환하지만 저장소와 최신 인스턴스 색인에 남지 않고, 요청 경로 좌표가 후속 `GET /api/data/{tag}`에서 조회되지 않는다.
- **SC-008:** v1 fixture는 지원 버전으로 정상 조회되고, 지원하지 않는 규격 버전 요청은 데이터 추측이나 변경 없이 명확한 오류로 거부되며, 최초 v2 전까지 범용 전진 변환 registry가 존재하지 않는다.
- **SC-009:** `GET /api/data/{tag}`가 등록된 view, 허용된 조회 조건, 접근 수준과 소유 범위를 검증하고 태그별 최신 인스턴스를 반환하며, 최신 인스턴스 색인이 같은 태그의 여러 조회 조건과 사용자를 서로 덮어쓰지 않는다. 사용자 A의 요청으로 사용자 B의 인스턴스·색인·알림을 조회할 수 없다.
- **SC-010:** 구조 검사에서 공통 데이터 모듈 밖의 운영 데이터 직접 저장·읽기와 명찰 없는 API 응답이 남지 않는다. 각 family는 독립적으로 전환 완료와 되돌리기를 검증할 수 있고, 대표 pilot의 종단 간 검증을 통과한 뒤 나머지 전환이 진행되며, 임시 호환 adapter는 해당 family 전환 완료 후 제거된다.
- **SC-011:** `model.kim_surface_wind` 소비자가 `model.kim`으로 전환되고 전용 저장·API 경로가 제거되며, `weather.flight_category_overlay`는 공통 규격으로 전환된 `suspended` 상태를 유지한다.
- **SC-012:** `Architecture.md`, 데이터 정책과 신규 데이터 추가 절차가 실제 공통 규격 구조와 일치하고, 규격·계약·구조·기존 애플리케이션 검증이 모두 통과한다.
- **SC-013:** 알림을 읽거나 채널 발송 상태를 갱신해도 `alert.triggered` 발생 인스턴스와 그 `content_hash`는 바뀌지 않으며, 기존 `read_at`, `pushed_at`, `channel_status`가 각각 사용자 피드와 전달 상태로 손실 없이 이관된다.

## Requirement Traceability

| Requirements | Verified by |
|---|---|
| FR-001–FR-007 | SC-001, SC-002, SC-009 |
| FR-008–FR-012A | SC-003, SC-004, SC-007, SC-007A, SC-008 |
| FR-013–FR-022 | SC-005, SC-006 |
| FR-023–FR-030 | SC-005, SC-009, SC-010 |
| FR-031–FR-035 | SC-007 |
| FR-036–FR-038 | SC-009 |
| FR-039–FR-044 | SC-001, SC-002, SC-010, SC-011, SC-013 |
| FR-045–FR-048 | SC-003, SC-004, SC-010, SC-012 |

## Alternatives Considered

| Option | Trade-off | Why not chosen |
|---|---|---|
| 카탈로그·게시판에만 메타정보를 두고 실제 데이터 payload는 유지 | 기존 수정량이 작음 | 데이터가 게시판과 분리되면 태그·버전·원본 연결을 잃어 전체 구조 통일 목표를 달성하지 못함 |
| `<분야>.<자료>.<범위>.<단계>` 네 칸 태그 | 이름만으로 많은 정보를 표현 | 범위와 처리 단계를 자유 입력하게 되어 태그가 불안정해지고 같은 family가 과도하게 분리됨 |
| 모든 후보와 중간 산출물에 전역 태그 부여 | 전수 목록이 명시적으로 보임 | 브리핑·알림 내부 상태까지 전역 계약으로 만들면 카탈로그와 interface가 얕고 복잡해짐 |
| 중앙 출판 이력과 메시지 브로커 도입 | 모든 변경 재생과 순서 처리가 가능 | 현재 요구는 최신 운영 상태와 태그 기반 연결이며 중간 변경 replay·exactly-once 요구가 없어 비용이 이익보다 큼 |
| 기존 API와 새 공통 API를 영구 병행 | 단계적 호환이 쉬움 | 이중 규격과 직접 저장 접근이 다시 표류해 유지보수 문제가 남음 |
| 태그마다 처음부터 별도 폴더·서버 registry 구성 | 격리가 명확함 | 현재 규모에서는 파일·배포 구조가 과도함. 논리적 family 소유권과 자동 카탈로그면 충분함 |

## Open Questions

- 없음. 물리적 파일 배치, pilot 목록, 이후 family별 전환 순서와 검증 명령은 후속 구현 계획에서 이 승인된 요구사항을 바꾸지 않는 범위로 정한다.
