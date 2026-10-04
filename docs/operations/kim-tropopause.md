# KIM 권계면·제트 운영 안내

KIM 전구모델(KIMG/NE57)로 WMO 열적 대류권계면과 제트기류(연직 최대풍)를 산출해 지도의 `권계면·제트` 레이어와 항로 연직 단면에 표출한다. 설계와 검증 근거는 [구현 계획](../design/proposals/2026-10-04-kim-tropopause-jet-plan.md)에 있다.

## 입력과 키

| 입력 | 출처 | 요청 |
|---|---|---|
| 1000–150 hPa 21층 `T`·`hgt`·`u`·`v` | 기존 KIM 수집(`kim_surface_wind`) | 추가 없음 |
| 100·70 hPa `T`·`hgt`·`u`·`v` | 이 processor | 8건 × 13시각 = 104건/회차 |

추가 입력 키는 기본 KIM 격자·GKTG 추가 입력과 같은 `selectKimRunCredential`로 발표회차(`tmfc`)에 따라 고른다: 00·06 UTC KIM 키, 12 UTC 레이더·위성 키, 18 UTC 항공 키. 키가 없거나 막히면 요청하지 않고 다른 키로 대체하지도 않는다. 장부에는 실제 사용한 키로 기록된다. API Hub 장부 operation은 `kim_grid_trop`(이름 `T`/`hgt`/`u`/`v`, 층 100/70)이다. 100·70 hPa `u`·`v`는 권계면 계산·제트 탐색에 쓰지 않고, 연직단면의 상층 등풍속선(80 kt 선이 150 hPa 위에서 닫히도록)에만 쓴다. 기본 21층이 모두 있는 시각만 추가 요청하며, 받은 원문은 `kim_nwp/runs/<run>/raw/trop/`에 두고 재사용한다.

## 계산

`backend/python/kim_tropopause/`(GKTG 가상환경의 NumPy 사용, 새 의존성 없음)를 `kim-tropopause-processor.js`가 시각마다 실행한다.

- `thermal.py`: 550 hPa~모델 상단에서 반층 감률이 2 K/km 이하로 떨어지고 그 위 2 km 평균도 2 K/km 이하인 가장 낮은 기압(Reichler 외 2003). 제1 권계면만 낸다. 위 2 km를 확인할 자료가 없을 만큼 높으면 `tropAboveTop=1`(모델 상단 부근 이상), 기준을 만족하는 층이 없으면 빈 값이다.
- `jet.py`: 500–150 hPa 연직 최대풍(원 격자, 평활 없음)과 그 기압. 축은 약간 평활한 바람으로 추적해 다듬되 원 능선에서 30 km 안으로 제한한다. 축 점의 95%가 실제 국지 최대풍에서 50 km 넘게 떨어지면 그 축은 `axisShown=false`로 저장하고 지도에 그리지 않는다(강풍대 빗금은 그대로).
- 출력(시각당 2차원): `trop`(hPa), `tropT`(°C), `tropAboveTop`, `vmax`(kt), `pmax`(hPa), 제트 축과 점검 수치(`checks`).

## 저장과 게시

- 시각별 불변 결과: `kim_nwp/runs/<run>/derived/tropopause/hfNNN/<revision>.json`
- 단면용 상층 격자(100·70 hPa `hgt`·`T`·`u`·`v`): 같은 폴더 `<revision>.upper.json`. 지도 API로는 내보내지 않는다.
- 게시: F000–F012가 모두 완성되면 `kim_nwp/derived/tropopause/latest.json`. 부분 실패·입력 변경·취소는 기존 게시를 바꾸지 않는다.
- 마지막 시도: `kim_nwp/derived/tropopause/last-attempt.json`(ADMIN 자료 상태의 `권계면·제트` 행)
- 보존: 게시 중인 회차와 진행 중·최근 부분 회차는 KIM 회차 정리에서 지키며, 그 밖은 KIM 회차와 함께 지운다.

## 일정과 실행

`kim_tropopause` 수집기는 GKTG와 같은 UTC 일정으로 점검하고, 기본 KIM 수집이 끝난 뒤에도 실행한다. 같은 lock이 정기·수동 중복 실행을 막는다.

| 환경 변수 | 기본 |
|---|---|
| `KIM_TROPOPAUSE_DISABLED=1` | 수집 끔 |
| `KIM_TROPOPAUSE_PYTHON` | `KIM_GKTG_PYTHON` 또는 `.venvs/kim-gktg/bin/python` |
| `KIM_TROPOPAUSE_TIMEOUT_MS` | 120000 |
| `KIM_TROPOPAUSE_COLLECT_ON_STARTUP=0` | 시작 시 수집 생략 |

## API

- `GET /api/kim/tropopause/index`: 게시 회차와 시각별 revision. 없으면 503.
- `GET /api/kim/tropopause/field?tmfc=...&hf=...&revision=...`: 한 시각의 결과. GET은 수집·계산을 하지 않는다.
- 항로 단면 응답(`/api/briefing/cross-section`, 브리핑 단면)의 `tropopause.samples`: 표본점별 권계면 기압·FL, 최대풍 kt·기압·FL. `tropopause.upperLevels`: 100·70 hPa 층별 고도·기온·u·v. 같은 유효시각만 읽는다.

## 표출

- 지도: 권계면 FL 파랑 5단계(FL450 상한, 약 1° 평활), `TROP` 라벨, 최대풍 80 kt 선과 100/120 kt 빗금(원 격자), 점검을 통과한 제트 축과 SIGWX식 바람깃·FL 라벨. 깃 위치는 핵과 풍속 ±20 kt·고도 ±3,000 ft 변화 지점(최소 400 km). 기관 고정 자료 모드는 아직 지원하지 않는다.
- 연직 단면: 권계면 선(층 평균 고도에 기압 보간, 라벨은 FL), 500 hPa 위 80·100·120 kt 등풍속선과 온위 10 K 선. 차트보다 높은 권계면은 상단에 `TROP … ▲`.

## 한계

- 150~100 hPa 층 간격이 넓어 FL500 부근 권계면은 변동을 잘 구분하지 못한다(시험에서 여름 상관 0.07). 지도 FL450 상한은 이 한계를 반영한 표시 결정이다.
- 성긴 층의 보간 때문에 표준대기 권계면(226 hPa)은 약 207 hPa로 나온다(시험 `backend/test/kim-tropopause.test.js`).
- KIM 보관 기간(약 170일) 때문에 겨울 사례 검증이 아직 없다.
