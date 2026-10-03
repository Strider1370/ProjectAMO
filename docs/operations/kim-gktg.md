# KIM 난류 GKTG 운영

기존 지도 `난류`는 Python으로 계산한 GKTG를 사용한다. 바람·기온·습도·착빙과 동일한 KIM 회차/예보시간/기압층 규격을 사용하며, 저장소 소유자는 `backend/src/processors/kim-nwp-store.js`다. 새 자료는 `DATA_PATH/kim_nwp` 안에 보관한다. 이전 KTG 수집은 정기·시작·수동 collector에서 제외했으며 과거 고정 자료의 KTG 해석은 유지한다.

## 환경과 배포

Python **3.12 이상**과 venv/pip가 필요하다. 고정 의존성은 `backend/python/kim_turbulence/requirements.txt`의 NumPy 2.5.3·Numba 0.68.0이다. 로컬 검증에는 Python 3.13을 사용했다.

```bash
bash scripts/setup-gktg-python.sh
# 기본 python3가 오래된 경우 설치된 인터프리터를 지정한다.
GKTG_BOOTSTRAP_PYTHON=python3.13 bash scripts/setup-gktg-python.sh
```

개발 bootstrap도 이 설정을 실행한다. 운영에서는 의존성 설치를 포함한 `deploy/deploy-vm-full.sh`를 사용한다. 기본 fast deploy로 최초 Python 환경을 만들 수 없다. full deploy는 `/opt/projectamo/shared/venvs/kim-gktg`를 준비하고 PM2 설정의 실행 경로를 반영한다. 서비스 계정이 계산 결과·Numba 캐시를 쓸 수 있어야 한다. 이 작업에서는 운영 배포를 실행하지 않았다.

| 환경변수 | 기본/의미 |
|---|---|
| `KIM_GKTG_PYTHON` | 개발 `.venvs/kim-gktg/bin/python`, 운영 shared venv 경로 |
| `GKTG_BOOTSTRAP_PYTHON` | 설치 인터프리터 지정. 생략하면 `python3`/`python3.14`/`python3.13`/`python3.12`에서 지원 버전을 찾음 |
| `KIM_GKTG_TIMEOUT_MS` | 한 예보시각 Python 계산 제한, 120000 ms |
| `NUMBA_CACHE_DIR` | 기본 `DATA_PATH/.numba-cache`, 운영 shared data 안 |
| `KIM_GKTG_DISABLED=1` | GKTG collector 비활성화 |
| `KIM_GKTG_COLLECT_ON_STARTUP=0` | 시작 시 계산 생략 |

실시간 계산은 Fortran·`reference/TURB`·검증 artifacts에 의존하지 않는다. 계수와 계산 모듈은 backend Python 패키지에 포함한다. `scripts/turbulence/`의 대응 모듈은 이 패키지의 상대 링크이며 원본 대조 도구도 같은 계산 구현을 검사한다.

## 키 배분과 입력

| 발표 UTC | 기본 KIM 격자·공항 비교 | GKTG 추가 입력 |
|---|---|---|
| 00 / 06 | KIM 키 | 레이더·위성 키 |
| 12 | 레이더·위성 키 | 레이더·위성 키 |
| 18 | 항공 키 | 레이더·위성 키 |

키 선택은 다운로드 실행 시간이 아닌 `tmfc`를 따른다. 키 누락/차단 시 다른 키로 자동 대체하지 않는다. 요청량은 공통 API Hub 장부에 **실제 인증 키와 KST 날짜**로 기록한다.

21층의 u/v/T/hgt/q와 착빙에 이미 쓰는 w를 재사용한다. 기본 13시각에서 추가 w 250/200/150 hPa·ps·hpbl은 최대 65요청/회차이고 지형 topo가 없으면 1요청을 추가한다. 같은 회차 지형은 시간별로 공유하고 기존 같은 격자의 topo raw 캐시도 사용한다. 추가 요청 operation은 `kim_grid_gktg`; 기본 격자/지형은 공통 `kim_grid` 계측을 따른다. URL만 보고 기본 키로 비용을 기록하지 않는다.

운영 대상은 F000–F012, 21개 원래 압력층, 205×169 지역 격자다. 모든 기본층을 확보하기 전에는 해당 시각의 추가 API를 요청하지 않는다. ADMIN 수동 실행도 같은 processor를 호출하며 기본 입력은 기존 KIM collector가 소유한다. 입력이 부족하면 KIM 수집을 먼저 실행하고 GKTG를 재시도한다.

```bash
# 운영 설정의 전체 13시각
npm run collect:gktg -- --tmfc 2026100300
# 로컬 검증 범위를 명시적으로 제한할 때만 사용
npm run collect:gktg -- --tmfc 2026091006 --hours 6,9
```

`--hours`의 제한 실행으로 만든 검증용 latest를 운영 기본 13시각 검증의 증거로 쓰지 않는다. 정기·ADMIN 실행에는 이 제한 인자를 주지 않는다.

## 실행·게시·실패 처리

`kim_gktg`는 기존 UTC 공개 지연/재시도 시간에 점검하고 기본 KIM 수집이 끝난 뒤에도 실행한다. registry가 스케줄·활성 상태를 소유하고 동일한 lock이 정기/수동 중복 실행을 막는다. 시험 모드의 `DISABLE_COLLECTION=1`은 자동 수집을 생략한다.

한 시각씩 3차원 입력을 구성하고 선택 24종→CAT/MWT→최종 GKTG를 계산한다. 시간별 21필드와 내용 해시를 검증한 뒤 모든 대상 시각이 완전할 때만 run manifest/latest를 원자적으로 게시한다. 입력·계수·계산 코드·의존성이 같고 저장 필드가 유효하면 계산 결과를 재사용한다. 게시 직전에 기본 입력이 그대로인지 다시 검사한다.

- `kim_nwp/runs/KIMG_NE57_<tmfc>/normalized/hfNNN/<pressure>/gktg/<hourRevision>.json`: 불변 필드와 같은 입력 hgt.
- `kim_nwp/runs/.../derived/gktg/<runRevision>/manifest.json`: 전체 회차의 시각별 필드 참조.
- `kim_nwp/derived/gktg/latest.json`: 마지막 완전한 계산의 포인터.
- global/per-run `derived/gktg/last-attempt.json`: 계산 시도·완료 필드 수·시각별 실패 원인.

부분 성공·예산 차단·입력 변경·Python 실패·취소는 기존 완전한 latest를 교체하지 않는다. 정상 시간별 결과는 재시도에 사용한다. 깨진 불변 파일은 조회에서 거부하고 재계산으로 복구할 때 원래 바이트를 별도 `.corrupt-*` 파일로 보존한다. 임시 cube와 24종 중간 결과는 운영 데이터에 계속 쌓지 않는다.

기존 KIM 정리는 GKTG latest 회차, 진행 중/최근 부분 계산, 기관 `pins.json` 참조 회차를 보호한다. 고정 자료를 유지하는 동안 해당 회차의 보관량이 기본 `max_runs`를 넘을 수 있다.

## 소비자 계약

`GET /api/kim/gktg/index`와 `GET /api/kim/gktg/field?tmfc=...&hf=...&level=...&revision=...`를 사용한다. index의 run revision과 availability의 시간별 field revision을 구분한다. 없는 시각·층·revision을 다른 선택으로 채우지 않으며 GET은 계산/수집을 실행하지 않는다. 과거 `/api/ktg/grid`는 명시적인 보관 회차만 읽고 live 기본 요청과 `/api/ktg/index`는 410이다.

등급은 `shared/gktg.js`의 0.15/0.22/0.34와 녹색/노랑/빨강을 공유한다. 원본 NCL처럼 단정밀도로 경계를 비교해 float32의 0.22가 MOD에 포함되도록 한다. null은 자료 없음이고 0이나 NIL로 바꾸지 않는다. 원시 float32 값은 JSON에서 그대로 보존한다.

지도는 기존 난류 버튼·KIM 시간축·기압층 rail을 사용한다. 연직단면·비행 전 브리핑·고도 비교는 필드에 보관한 같은 입력 hgt로 실제 지점 고도를 정하고 지지하는 압력층 사이에서 판정한다. 강도 판정은 인접 유효층의 더 강한 값을 사용하고 결측 이웃/영역 밖/고도 범위 밖은 채우지 않는다. 기관 고정 지도는 저장한 회차·시각·시간별 revision을 읽고 최신 자료로 바뀌지 않는다. 스냅샷은 같은 `kim_nwp` 디렉터리에 포함한다.

비행 알림의 재브리핑도 새 GKTG를 읽는다. 기존 알림 변화 감지 종류는 minima·TS/FG/SN·SIGMET이며 난류 전용 변화 알림은 원래 없다. 이번 교체로 새로운 난류 알림 정책을 추가하지 않았다.

ADMIN은 `난류(GKTG)` 행의 자료 상태·수동 실행·다음 점검·계산 시각별 실패·공통 KIM 디스크 사용량을 표시한다. 입력 대기/부분 계산은 마지막 성공으로 기록하지 않는다.

## 검증과 현재 제한

[구현 결과 보고서](../design/proposals/2026-10-03-kim-gktg-implementation-report.md)에 실제 실행 증거와 미완료 항목을 기록한다. 현재 로컬 실자료는 `2026091006` +6/+9시간의 42필드다. F000–F012 전체와 네 회차의 실측 키 사용량은 API Hub 예산 차단 해소 후 기존 장부를 유지한 채 검증해야 한다.
