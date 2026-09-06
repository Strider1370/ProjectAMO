# 공항 모델 비교 운영

공항 상세 예보 분석은 KIM, ECMWF IFS, GFS Global, ICON Global의 모델별 실제 실행을 공항별 immutable payload로 저장한다. 브라우저는 제공자 API를 직접 호출하지 않으며 활성 데이터 뷰의 `/api/airport/:icao/model-comparison`만 읽는다.

## 켜기와 끄기

해외 세 모델은 `OVERSEAS_NWP_DISABLED=1`로 함께 끈다. KIM 비교는 기존 `KIM_NWP_DISABLED=1` 설정을 따른다. OFF 상태에서는 수집 job과 관리자 화면의 다음 점검이 없어야 한다. 설정을 바꾼 뒤에는 서버를 재시작해 collector registry를 다시 구성한다.

## 실행과 시간창 확인

각 모델의 포인터는 `DATA_PATH/airport_model_comparison/<model>/latest.json`에 있고 공항별 `run_at`, `available_at`, `collected_at`, `window_start_at`, `window_end_at`, `path`, `revision`을 보존한다. `path`는 같은 모델 디렉터리 아래 `runs/<run>/<airport>/...json`을 가리킨다. 값은 UTC ISO이며 화면에서만 KST 또는 사용자가 고른 시간대로 바꾼다.

KIM, GFS, ICON은 실제 실행의 F000~F012를 쓴다. ECMWF는 실제 `run_at`을 유지하고 peer 최신 실행과 같은 유효시각을 덮도록 13개 forecast hour를 이동한다. 따라서 EC 00Z와 peer 06Z 조합은 EC F006~F018이 정상이다. `last-attempt.json`에는 대상 실행, 공항별 window, 성공·재사용·실패 공항, 오류와 다음 10분 점검 시각이 남는다.

## 재시도와 보존

정기 collector는 새 실행 또는 EC window 이동이 필요할 때만 실행한다. 일부 공항이 실패해도 이미 발행된 성공 공항 포인터는 유지한다. 다음 cron 또는 관리자 수동 수집이 실패 공항을 다시 시도한다. 오류 조사 시 `last-attempt.json`, 관리자 자료 수집 상세, stats의 collector/API operation 결과를 함께 본다. 제공자 실패 때문에 마지막 성공값을 삭제하거나 포인터를 수동으로 바꾸지 않는다.

보존 정리는 모델별 최근 실행과 모든 현재 공항 포인터가 참조하는 실행을 보호한다. Snapshot은 `airport_model_comparison`, METAR, AMOS 전체 디렉터리를 복사한다. 비교 디렉터리가 있는 snapshot은 모든 latest 포인터의 내부 payload가 존재해야 준비 완료가 된다. 비교 기능 도입 전 snapshot에는 이 검사를 강제하지 않는다.

## 실자료 검증

실제 수집은 운영 DATA_PATH와 분리된 임시 디렉터리에서 수행한다. 출력은 ignored artifact의 작업 디렉터리로 제한된다.

```bash
node scripts/verify-airport-model-comparison.mjs \
  --airport RKSI \
  --output artifacts/airport-model-comparison/rksi-$(date -u +%Y%m%dT%H%M%SZ)

node scripts/verify-airport-model-comparison.mjs \
  --airport RKPU \
  --model gfs \
  --output artifacts/airport-model-comparison/rkpu-gfs
```

`--airport fullsupport`는 지원 공항 8곳을 검사한다. `--model`은 `kim`, `ecmwf`, `gfs`, `icon`, `all` 또는 쉼표 목록을 받는다. KIM 실행을 이미 확인했다면 `--kim-run YYYYMMDDHH`(또는 `--run`)로 고정한다. 기본값은 최신 cycle을 완료된 것으로 가정하지 않고 실제 API 응답으로 후보를 확인하며, 사용할 수 없으면 이전 후보로 내려간다. 각 모델은 5분 timeout을 가지며 wait loop가 없다. 외부 자료가 없거나 인증이 맞지 않으면 report의 `success`가 false이고 오류가 정리되어 기록된다. Fixture 통과를 실자료 성공으로 합치지 않는다.

KIM 검증은 전체 한반도 격자를 받지 않는다. 공항을 둘러싼 가장 가까운 2×2 격자점만 `sub`로 요청하고 production parser, comparison hour loader, normalizer와 store를 그대로 통과한다. 공항마다 별도 작업 raw cache를 써서 첫 공항의 2×2 응답을 다른 공항에 재사용하지 않는다. 운영 저장소의 오래된 실행을 최신 실행이라고 바꾸거나 쓰지 않는다. 18Z 실행은 `selectKimRunCredential`의 항공키 선택 규칙을 그대로 따른다.

검증 실행 순서는 KIM → GFS → ICON → ECMWF다. EC window는 이 검증에서 실제로 발행된 peer 포인터만 다시 읽어 계산한다. KIM을 실행하지 않았거나 후보 수집이 실패했다면 추측한 KIM cycle로 EC를 이동하지 않는다. peer 모델을 하나도 실행하지 않은 EC 단독 검증은 EC 자체 실행의 F000~F012를 쓴다.

`report.json`은 모델별 요청 실행/실제 실행/window, 필드 수, 허용 결측, 예상 밖 결측, 발행·재사용·실패 공항, 요청 횟수·바이트와 정리된 오류를 담는다. 공항별 JSON은 실제 store read 결과다. KIM/GFS/ICON은 각 13개 F000~F012, EC는 이동된 13개 시각인지 확인한다. 한 시각 또는 마지막 성공자료만으로 전체 실자료 검증 완료를 주장하지 않는다.

Committed fixture의 출처와 SHA-256은 `backend/test/fixtures/airport-model-comparison/manifest.json`에 있다. GFS F008/F009 expected는 production parser와 독립적으로 저장한 ecCodes 2.48.0 결과다. 새 GRIB 실행을 추가할 때도 임시 검증 환경의 ecCodes로 template, level, step time, sample 값을 대조하며 제품 runtime에는 Python/ecCodes 의존성을 추가하지 않는다.

브라우저 fixture의 RKPU 숫자는 과거 실자료 검증에서 얻은 **2026-09-06 09Z 한 시각의 실제 표본값**이다. UI의 13시간 상호작용을 결정적으로 검증하기 위해 그 숫자를 13칸에 복제하고 peer 실행을 06Z로 맞춘 구간은 합성 horizon이다. 이를 13시간 실예보 수집이나 실제 peer 실행 정렬의 증거로 사용하지 않는다.

## 운고 해석 한계

실자료 검증의 KIM 요청은 공항 주변 2×2 격자만 읽는다. 일시적인 `fetch failed` 전송 오류만 최대 세 번 시도하고 각 시도 수를 보고한다. HTTP/제공자 오류를 성공으로 바꾸지 않는다. 검증 출력의 `raw/kim/<ICAO>`는 재실행에 재사용되며 실황 저장소를 변경하지 않는다.

GFS만 제공자 진단 운고를 사용한다. KIM은 운량과 응결물, ECMWF는 습도 기반 파생 운량, ICON은 압력면 운량으로 5,000 ft 이하 ceiling을 추정한다. `not_detected_below_limit`, `no_ceiling`, `missing_input`, `outside_run`은 서로 다른 상태다. 추정값은 관측과 대조해 정확도를 검증한 항공 운고가 아니며, 숫자가 없다는 이유로 맑음이나 0 ft로 표현하지 않는다.
