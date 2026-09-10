# KIM 8km 수치예보모델 기반 기상 레이어 확장 아웃라인

## 목적

ProjectAMO의 MET overlay를 KMA KIM 8km 수치예보모델 자료 기반으로 확장한다. 첫 구현은 Mapbox 지도 위 지상풍 애니메이션과 풍속 색상 레이어이며, 이후 같은 데이터 파이프라인을 고도별 WIN/TEM, 구름가능역, 착빙가능역으로 확장한다.

이 문서는 구현 상세가 아니라 전체 기능군의 범위, 데이터 원천, 처리 방향, 단계별 우선순위를 정하는 설계 기준이다.

## 결정된 전제

- 기본 모델은 KIM 8km 전구 모델 `KIMG / NE57`을 사용한다.
- 전구 전체를 내려받지 않고 한국 주변 격자 영역만 `map=S&sub=...`로 조회한다.
- 1km KIM l010은 초기 구현 대상에서 제외하고, 나중에 확대/정밀 모드 후보로 남긴다.
- 지도 관련 feature-specific Mapbox write는 `frontend/src/features/map/MapView.jsx`에 직접 넣지 않고 `frontend/src/features/weather-overlays/lib/`에 둔다.
- `MapView.jsx`는 Mapbox lifecycle, style readiness, high-level sync 호출만 담당한다.
- 난류가능역은 이번 범위에서 제외한다.
- 내부 저장소는 지상풍 전용 `kim_surface_wind/latest.json` 확장이 아니라 `DATA_PATH/kim_nwp/`를 canonical store로 사용한다.
- 첫 확장 구현은 wind-only `u/v`이지만, 저장 스키마는 같은 `tmfc/hf/level/variables` 축에 `T/hgt`를 추가할 수 있어야 한다.
- 지도 렌더링용 particle field, speed layer, legend는 `kim_nwp` normalized grid에서 파생되는 UI 산출물이며 원본 저장소가 아니다.
- route briefing과 경로별 연직기상단면은 나중에 같은 `kim_nwp` normalized grid를 샘플링해서 사용한다.

## 데이터 원천

### 지상풍

초기 Windy식 particle animation과 풍속 색상 레이어는 단일면 자료를 사용한다.

```text
endpoint: nph-kim_nc_xy_txt2
group=KIMG
nwp=NE57
data=U
name=u10m, v10m
level=0
map=S
```

`u10m`과 `v10m`은 한 번에 묶지 않고 변수별로 각각 호출한 뒤 서버에서 합친다. 이전 검증에서 `name=u,v` 같은 복수 변수 호출은 실패할 수 있었다.

### 고도별 WIN/TEM

고도별 바람/기온은 등압면 자료를 사용한다.

```text
data=P
name=u, v, T, hgt
level=1000, 925, 850, 700, 500 ...
```

KIM 8km 변수표 기준 `u`, `v`, `T`, `hgt`는 30개 pressure level에 존재한다. `level`은 ft나 m 고도가 아니라 hPa 등압면이다. 항공 UI에서 ft/FL 기준으로 보여주려면 `hgt`를 함께 사용해 pressure level을 실제 고도 축으로 변환하거나 수직 보간한다.

### 구름가능역

구름가능역은 등압면 자료의 습도 및 cloud 계열 변수를 사용한다.

후보 변수:

- `T`: air temperature, K
- `rh`: relative humidity, %
- `q`: specific humidity, kg/kg
- `hgt`: geopotential height, m
- `cld`: cloud area fraction in atmosphere layer
- `cldbulk`: bulk cloud fraction
- `tqc`: cloud liquid water content
- `tqi`: cloud ice content

초기 판정은 `rh >= threshold` 또는 `T - Td <= 3C`를 기본으로 한다. `Td`는 `T`와 `rh`에서 계산한다. 모델 cloud variable이 안정적으로 조회되면 `cld/cldbulk/tqc/tqi`를 보조 또는 대체 지표로 사용한다.

### 착빙가능역

착빙가능역은 구름 또는 포화 조건과 온도 조건을 조합한다.

초기 판정:

```text
cloud 조건: rh >= 80~90% 또는 cld > 0 또는 tqc > threshold
temperature 조건: -20C <= T <= 0C
```

더 강한 후보:

```text
cloud 조건 && -15C <= T <= -3C && tqc > threshold
```

이 결과는 항공 예보 확정값이 아니라 수치모델 기반 가능역으로 표시한다.

## 격자 영역 전략

KIM 8km g576 격자는 정규 위경도 격자다.

```text
lon interval: 0.083333 degree
lat interval: 0.083333 degree
grid size: 4320 x 2160
```

초기 운영 영역은 한국 주변 bbox를 사용한다.

```text
lon: 119 ~ 136
lat: 30 ~ 44
approx sub: 1429,1441,1633,1609
approx size: 205 x 169
```

정확한 `sub` 계산은 백엔드 helper로 중앙화한다. bbox는 설정값으로 두되, 첫 구현에서는 고정 한국 주변 영역으로 충분하다.

## 백엔드 구조

### 수집 계층

`backend/src/api-client.js`에 KIM 8km 전용 URL builder를 추가한다.

역할:

- `tmfc`, `hf`, `data`, `name`, `level`, `bbox/sub`를 받아 URL 생성
- 변수별 개별 호출
- `file is not exist`, `Variable not found`, 빈 자료, 실제 데이터가 포함된 `fsize: 0byte` 응답을 구분

### 파싱 계층

새 parser는 KMA ASCII 격자 응답을 구조화한다.

입력:

- `#` 헤더
- `# j = n` 행 구분
- scientific notation 숫자 배열

출력:

```json
{
  "variable": "u10m",
  "unit": "m/s",
  "level": 0,
  "nx": 205,
  "ny": 169,
  "bounds": { "lonMin": 119, "latMin": 30, "lonMax": 136, "latMax": 44 },
  "values": [...]
}
```

### 처리 계층

`backend/src/processors/` 아래에 수치모델 파생 처리기를 둔다.

후보 모듈:

- `kim-wind-processor.js`: `u10m/v10m` 결합, speed/direction metadata 계산
- `kim-aloft-processor.js`: 등압면 `u/v/T/hgt` 결합
- `kim-hazard-processor.js`: 구름가능역, 착빙가능역 산출

초기에는 파일을 과하게 나누지 않고, wind surface와 aloft/hazard가 섞이지 않도록 경계만 명확히 둔다.

### 저장소와 API

KIM NWP는 METAR/TAF처럼 단일 `latest.json`에 모두 넣지 않는다. 대용량 격자값은 run/time/level별 파일로 나누고, `latest.json`과 `index.json`은 작은 pointer/manifest로 유지한다.

저장 구조:

```text
DATA_PATH/
  kim_nwp/
    latest.json
    index.json
    runs/
      KIMG_NE57_2026051900/
        raw/
          hf000/10m/u.txt
          hf000/10m/v.txt
        normalized/
          hf000/10m/grid.json
          hf003/925hPa/grid.json
```

`grid.json`은 하나의 `tmfc + hf + level`에 대한 canonical grid이며, 이번 wind phase에서는 `variables.u/v`만 저장한다. 이후 WIN/TEMP phase에서는 같은 구조에 `variables.T/hgt`를 추가한다.

운영 원칙:

- `grid.json`, `index.json`, `latest.json`은 atomic write로 저장한다.
- 보관은 run directory 단위로 관리하고 기본 최근 2개 usable run만 유지한다.
- failed collection은 기존 usable run을 지우거나 `latest.json`을 갱신하지 않는다.
- route-specific sampled output은 기본 저장하지 않고 요청 시 생성한다.
- 과거 valid time은 디스크에는 보존하고, 지도 API/UI 노출 단계에서만 숨긴다.

지도 API:

```text
GET /api/kim/surface-wind
GET /api/kim/wind/index
GET /api/kim/wind/field?tmfc=2026051900&hf=3&level=925hPa
```

`/api/kim/surface-wind`는 기존 map compatibility facade로 유지한다. 내부적으로는 `kim_nwp` index/grid를 읽어 선택된 하나의 renderer-compatible `kim_surface_wind` 응답을 만든다.

후속 API 후보:

```text
POST /api/kim/nwp/route-sample
GET /api/kim/cloud-potential?level=850
GET /api/kim/icing-potential?level=850
```

대용량 raw grid를 그대로 반복 전송하지 않도록, 지도 API는 index와 selected field를 분리한다. normalized grid는 우선 gzip-friendly int16-scaled JSON으로 시작하고, 필요하면 후속 단계에서 binary storage를 검토한다.

## 프론트엔드 구조

### 공통 원칙

- MET panel에 새 레이어를 추가한다.
- feature-specific Mapbox source/layer/canvas logic은 `frontend/src/features/weather-overlays/lib/`에 둔다.
- `frontend/src/api/weatherApi.js`는 API fetch와 snapshot meta 연동만 담당한다.
- `MapView.jsx`는 weather-owned sync helper 호출만 추가한다.

### 레이어 후보

초기 레이어:

- `windParticles`: 지상풍 particle animation
- `windSpeed`: 지상풍 속도 색상 레이어

후속 레이어:

- `winTemAloft`: 고도별 WIN/TEM
- `cloudPotential`: 구름가능역
- `icingPotential`: 착빙가능역

UI는 운영 도구 성격에 맞춰 과한 설명보다 상태, 기준시각, 고도/level 선택, legend를 우선한다.

## 렌더링 방향

### 바람 애니메이션

지도 위에 canvas 기반 particle overlay를 올리고, 현재 viewport에서 보이는 영역만 그린다. 데이터는 한국 주변 subset 전체를 들고 있되, 렌더링은 화면 픽셀과 zoom에 맞춰 제한한다.

상세 설계는 별도 문서에서 다룬다.

### 풍속 색상 레이어

풍속 색상은 particle과 같은 `u10m/v10m` 데이터에서 계산한다.

초기 선택지:

- 서버에서 speed grid를 함께 내려주고 프론트 canvas로 렌더링
- 프론트에서 `sqrt(u*u + v*v)` 계산 후 offscreen canvas로 렌더링

초기 추천은 서버에서 metadata와 min/max만 제공하고, 프론트에서 speed를 계산해 particle과 공유하는 방식이다. 이후 성능 문제가 있으면 서버 산출 raster 또는 compact grid로 전환한다.

### 고도별 WIN/TEM

지도 레이어와 route briefing 차트를 분리해서 생각한다.

지도 레이어:

- 선택한 pressure level의 wind/temp를 표시
- wind barb, 색상 raster, point sample popup 중 하나를 선택

경로 차트:

- 경로를 일정 거리로 샘플링
- 각 샘플에서 `u/v/T/hgt`를 수평 보간
- pressure level을 hgt 기반 고도축으로 변환
- 거리 x 고도 단면에 wind/temp를 표시

초기 구현은 지도보다 route briefing 차트 쪽의 가치가 크다.

### 구름가능역과 착빙가능역

초기에는 선택 level 또는 대표 level의 가능역 heatmap으로 시작한다. route briefing에서는 경로 샘플별 risk band로 요약한다.

표현:

- 구름가능역: 반투명 회색/청색 계열 heatmap
- 착빙가능역: 반투명 보라/분홍 계열 heatmap
- 레전드에는 기준식을 명시한다. 예: `RH >= 85% and -20C <= T <= 0C`

이 레이어들은 예보 확정값이 아니라 수치모델 기반 가능역이므로 UI 문구도 `Potential` 성격으로 유지한다.

## 단계별 구현 순서

### Phase 1: 지상풍 데이터 파이프라인

목표:

- KIM 8km `u10m/v10m` subset 조회
- ASCII 응답 파싱
- u/v 결합
- `kim_nwp` canonical store 저장
- `/api/kim/surface-wind` 제공

검증:

- 작은 sub 영역 fixture 파싱 테스트
- 한국 주변 sub의 nx/ny/bounds 검증
- `file is not exist`와 실제 데이터 포함 `fsize: 0byte` 구분 테스트
- `kim_nwp/latest.json`, `index.json`, `runs/*/normalized/*/grid.json` 구조 검증
- atomic write와 retention 검증

### Phase 2: 지상풍 지도 표현

목표:

- Wind particle layer
- Wind speed color layer
- MET panel toggle
- 기준시각/예측시간 표시
- 전 고도 공통 kt 풍속 색상 scale 유지

검증:

- basemap switch 후 레이어 유지
- visibility toggle 동작
- animation pause/cleanup
- desktop/mobile viewport에서 겹침 없는지 확인
- 같은 색이 모든 level에서 같은 kt 범위를 의미하는지 확인

### Phase 2.5: 바람 시간/고도 선택

목표:

- 최신 usable KIM run 기준 `hf 0..36` 중 현재 이후 valid time 노출
- `10m`, `925`, `850`, `700`, `500`, `300 hPa` 선택
- `/api/kim/wind/index`와 `/api/kim/wind/field` 제공
- 빠른 선택 변경 시 stale response가 화면에 commit되지 않도록 hook 취소/캐시 처리

검증:

- past valid time은 API/UI에서 숨기되 디스크 grid는 보존
- 잘못된 `tmfc/hf/level` 요청 거부
- 선택 변경 시 Flow와 Speed가 같은 field로 갱신
- `MapView.jsx`는 high-level wiring만 유지

### Phase 3: 고도별 WIN/TEM 데이터

목표:

- 기존 `kim_nwp` 구조에 등압면 `T/hgt` 추가
- route briefing용 sampling API 설계 및 구현
- 경로별 연직기상단면의 시간/연직 보간 책임 결정

검증:

- pressure level별 unit 변환
- `T` Kelvin to Celsius
- `u/v` to wind direction/speed
- `hgt` 기반 고도축 생성
- route axis 샘플별 `u/v/T/hgt` 수평 보간
- 격자 밖 sample은 clamp하지 않고 `null` 처리

### Phase 4: 구름가능역

목표:

- `T/rh` 기반 dew point spread 계산
- `cld/cldbulk/tqc/tqi` 활용 가능성 확인
- 선택 level heatmap 또는 route risk band 제공

검증:

- `T - Td <= 3C` 조건 계산
- RH threshold 조정 가능
- cloud variable 결측 시 fallback

### Phase 5: 착빙가능역

목표:

- cloud 조건과 온도 조건 결합
- level별 icing potential 산출
- route briefing에서 구간별 착빙 가능성 표시

검증:

- `-20C <= T <= 0C` 조건
- `tqc` 존재 여부에 따른 가중치
- 위험도 문구가 확정 예보처럼 보이지 않는지 UI 검토

## 주요 리스크와 대응

### API 가용성

최신 cycle이 아직 생산되지 않았을 수 있다. 백엔드는 최신 후보를 역순 탐색하고, 실패하면 이전 사용 가능 cycle을 사용한다.

### 데이터 크기

한국 subset은 전구 전체보다 작지만, 등압면 다층 자료를 여러 변수로 받으면 커질 수 있다. 초기 wind 확대는 `6 levels x 13 forecast hours x 2 variables` 범위로 제한하고 bounded concurrency로 수집한다. 이후 `T/hgt`를 추가할 때는 같은 `kim_nwp` run directory 안에서 변수만 확장한다.

### 동시 읽기/쓰기 안정성

지도 API와 향후 route sampler가 collector와 동시에 같은 grid를 읽을 수 있으므로, KIM NWP store는 atomic write를 기본으로 한다. Cleanup은 `latestRunId`를 항상 보존하고, failed collection은 기존 usable run을 삭제하지 않는다.

### 시간/보간 정책

디스크 저장소는 과거 valid time까지 보존한다. 지도 UI는 현재 시각 이전 valid time을 숨기지만, route briefing이나 사후 검증은 저장된 grid를 직접 선택할 수 있어야 한다. 시간 보간과 pressure/height level 간 연직 보간은 Phase 3에서 route briefing 요구사항과 함께 결정한다.

### 항공 해석 정확도

구름가능역과 착빙가능역은 수치모델 변수 기반의 가능역이다. 공식 SIGWX나 조종사 브리핑을 대체하는 표현으로 만들지 않는다.

### UI 복잡도

MET panel에 레이어가 많아질 수 있다. 초기에는 지상풍을 weather group에 추가하고, 고도별/위험가능역 기능은 별도 advanced group 또는 route briefing 내부로 분리하는 방향을 검토한다.

## 현재 추천

1. `kim_nwp` canonical store를 기준으로 wind-only `u/v` 시간/고도 선택을 먼저 만든다.
2. 같은 selected field로 particle animation과 wind speed color layer를 같이 제공한다.
3. 풍속 색상은 모든 고도에서 같은 kt scale을 사용해 같은 색이 같은 속도를 뜻하게 한다.
4. 등압면 기반 WIN/TEM은 `T/hgt`를 같은 `kim_nwp` 구조에 추가한 뒤 route briefing 차트를 우선 목표로 둔다.
5. 구름가능역과 착빙가능역은 등압면 selected level heatmap보다 route briefing risk band가 더 실용적일 수 있으므로, 지도 레이어는 후순위로 둔다.
6. 난류가능역은 이번 범위에서 제외하고, 향후 별도 알고리즘 검토 후 추가한다.
