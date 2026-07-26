# 관리자 콘솔(Admin Console) 설계

작성일: 2026-07-07 · 상태: 설계 확정(구현 대기)

## 1. 목적 / 범위

운영자(admin)가 한 화면에서 **서버 상태를 보고, 가입을 승인하고, 예보관 계정을 만드는** 관리자 페이지.
기존 로그인/역할 시스템(`pilot`·`forecaster`·`admin`, `backend/src/auth`, `backend/src/db/users.js`) 위에 얹는다.

**범위 안:**
- 서버 대시보드: 시스템 리소스(CPU·메모리·디스크) 현재값 + 24시간 타임라인(피크 표시), 트래픽(현재 접속자·총 방문자·오늘 추이)
- 가입 승인/거절
- 예보관 계정 생성(다이얼로그)
- 전체 사용자 목록(읽기 전용)

**범위 밖(YAGNI, 이번에 안 함):** 사용자 삭제·역할 변경·비밀번호 초기화, 이메일 인증, 외부 분석도구(GA 등), 실시간 소켓 스트리밍(폴링으로 충분).

## 2. 접근 제어

- 프론트: `/admin` 라우트. admin 역할만 진입, 그 외 역할·비로그인은 차단(리다이렉트/403 화면).
- 백엔드: `/api/admin/*` 라우터 전체에 `requireRole('admin')`(이미 존재, `backend/src/auth/middleware.js`).
- 최초 admin 계정은 기존 CLI(`backend/src/db/create-user.js`)로 생성(변경 없음).

## 3. 가입 승인 (기존 흐름 변경)

현재: 조종사 가입 → 즉시 활성(바로 로그인). 이걸 **승인 대기**로 바꾼다.

- **스키마**: `users`에 `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','rejected'))` 추가.
  - idempotent 마이그레이션: 컬럼 없으면 `ALTER TABLE ... ADD COLUMN`. **기존 사용자는 전부 `active`**(안 끊기게) — 기본값 active로 추가되므로 자연 처리.
- **가입**(`POST /auth/register`): 신규 조종사는 `status='pending'`으로 생성.
- **로그인**(`POST /auth/login`): `verifyLogin` 성공해도 `status !== 'active'`면 로그인 거부 + 전용 코드(`pending_approval` / `rejected`) 반환. 프론트는 안내 문구 표시.
- **승인/거절**(admin): 대기 목록 → 승인(`active`) / 거절(`rejected`).

## 4. 예보관 계정 생성

- 대시보드에 폼을 상시 노출하지 않는다. 전체 사용자 카드의 **"예보관 추가" 버튼 → 다이얼로그(모달)**.
- 입력: 아이디, 비밀번호, 표시 이름, **담당 공항**(국내 공항 다중 선택, `users.airports` JSON — #6과 동일 개념).
- 서버: `POST /api/admin/forecasters` → 기존 `createUser(db,{role:'forecaster', airports, …})` 재사용. 생성 즉시 `status='active'`.

## 5. 전체 사용자 목록

- 읽기 전용 표: 아이디 · 역할(badge) · 상태(badge) · 가입일.
- 정렬/필터는 최소(초기엔 최신 가입순). 대량이면 후속에 페이지네이션.

## 6. 서버 대시보드

### 6.1 시스템 리소스
- **현재값**: CPU 부하, 메모리 사용/전체, 디스크 사용/여유. Node `os`(loadavg·freemem/totalmem) + 디스크 용량 조회(`statfs`/`df`).
- **24시간 타임라인**: CPU·메모리·디스크 3선 라인차트 + **피크 지점 표시**(예: "피크 82% · 14:00"). 기간 선택 1h/24h/7d.
- **지표 기록(신규 저장)**: 백엔드가 주기적으로(예: 60초) 리소스를 샘플링해 시계열 보관.
  - 저장: 작은 테이블 `metrics(ts, cpu_pct, mem_used, mem_total, disk_used, disk_total)` 또는 링버퍼+주기 flush. 보관 창(예: 7일) 넘으면 정리.
  - 임계 색상: <70% 초록 · 70–89% 주황 · 90%+ 빨강(리서치: Grafana/CloudPanel 관례).

### 6.2 트래픽 (익명 방문자 포함)
- **현재 접속자** = 최근 5분 내 활동한 고유 방문자 수. **총 방문자** = 누적 고유 방문자 수. **오늘 추이** 스파크라인.
- **방문 추적(신규)**: 가벼운 미들웨어가 모든 방문자(비로그인 포함)에 **익명 방문자 쿠키(uuid)** 부여 + 최근 활동시각 기록.
  - 저장: `visits(visitor_id PRIMARY KEY, first_seen, last_seen)`. 현재접속 = `last_seen > now-5m` 카운트, 총 = row 수.
  - 외부 분석도구 없이 서버만으로. 봇/헬스체크는 UA·경로로 최소 필터(과함 방지, 후속 튜닝).

## 7. API 요약 (`/api/admin/*`, requireRole admin)

| 메서드·경로 | 용도 |
|---|---|
| `GET /api/admin/metrics` | 현재 리소스 + 지정 기간 타임라인(1h/24h/7d) + 피크 |
| `GET /api/admin/traffic` | 현재 접속자·총 방문자·오늘 시간별 |
| `GET /api/admin/users` | 전체 사용자(아이디·역할·상태·가입일) |
| `GET /api/admin/pending` | 승인 대기 목록 |
| `POST /api/admin/users/:id/approve` · `/reject` | 승인·거절 |
| `POST /api/admin/forecasters` | 예보관 계정 생성 |

대시보드는 몇 초 간격 폴링으로 갱신(소켓 불필요).

## 8. 프론트 구조

- `/admin` 페이지(관리자 전용 가드). 레이아웃은 v3 목업 기준:
  1. 시스템 리소스(현재값 + 24h 타임라인 + 기간 토글)
  2. 트래픽(현재 접속자·총 방문자·오늘 스파크라인) · 가입 승인 대기(승인/거절) — 2열
  3. 전체 사용자 표(우상단 "예보관 추가" → 다이얼로그)
- 디자인: `docs/design/design-language.md` 준수 — Pretendard, accent slate `#334155`, Fluent 카드/배지, 임계 색상은 level 토큰(green/amber/red).

## 9. 데이터 모델 변경 요약

- `users.status` 컬럼 추가(마이그레이션, 기존=active).
- `metrics` 시계열 테이블(또는 링버퍼) 신규.
- `visits` 방문 추적 테이블 신규.

## 10. 보안 메모

- 모든 admin API는 `requireRole('admin')`. 예보관 생성 시 비밀번호는 기존 해시 경로(`createUser`) 사용.
- 방문자 쿠키는 식별정보 없음(uuid만), 개인정보 아님.
- 승인 거절 사용자는 로그인 차단(계정 열거 방지 정책과 상충 없게 로그인 응답 코드 설계).
