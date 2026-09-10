# 기관 라운지 운영·검증

## 저장과 권한

기관 데이터는 기존 `projectamo.db`의 `organization_*` 테이블에 저장한다. 기관 역할 `admin`, `planner`, `member`는 서비스 계정 역할과 별개다. 서비스 관리자가 기관과 초기 기관 관리자를 등록하고 기관 관리자가 구성원을 배정한다. 구성원 자격·계정 활성 상태는 각 기관 HTTP 요청에서 다시 확인한다.

공유자료 원본·썸네일은 `ORGANIZATION_FILES_PATH`에 보관한다. 운영 기본값은 `/opt/projectamo/shared/organization-files`, 개발 기본값은 저장소의 ignored `artifacts/organization-files`이며 공개 weather data 디렉터리 밖에 있어야 한다. 별도 인스턴스는 해당 변수로 경로를 지정한다. 백업도 동일한 기본값/환경변수를 사용한다. 자료는 권한 검사를 거친 `/api/organizations/:orgId/materials/...`에서만 제공한다.

PDF.js가 backend/frontend 의존성에 추가되므로 배포 시 `deploy/deploy-vm-full.sh`를 사용한다. `deploy/nginx/projectamo.conf.example`의 `/data` DB·백업·기관 파일 차단 설정도 반영한다. 이 문서와 구현은 배포 실행을 의미하지 않는다.

## 개인 비행을 기관에 공유

1. 기존 개인 화면에서 비행경로 또는 브리핑을 저장한다.
2. 계정의 저장 브리핑 목록에서 `기관에 공유`를 누르거나 기관 예정비행에서 `내 비행 공유`를 누른다. 소속 기관과 개인 저장 자료를 선택하고 출발·도착시각 및 고도를 확인한다.
3. 공유 후 `기관 비행 보기`로 이동한다. 다른 활성 구성원도 예정비행 목록에서 공유본을 보고 `기상 브리핑 보기`로 기존 브리핑 화면을 연다.

일반회원도 자기 저장 자료를 공유하고 공유한 계획을 수정할 수 있다. 관리자·계획관리자만 담당자를 변경하며, 작성자는 재배정 후에도 계획·주의사항을 수정할 수 있다. 다른 담당 조종사는 주의사항·자료 연결 권한을 유지한다. 서버가 개인 저장 자료의 소유권과 기관 소속을 확인하며 `createdBy`는 불변이다. 기관 공유본은 독립된 버전이므로 개인 원본의 수정·삭제와 자동 동기화되지 않는다.

기상 화면은 기존 브리핑 UI를 사용하고 기관용 중복 시각·고도 조작 패널을 표시하지 않는다. 기관 데이터 조회는 권한·버전을 검증하는 전용 API를 사용한다. 닫기는 해당 기관 비행 상세로 돌아간다. 실패에는 재시도 안내를 표시하며 자료 누락을 위험 없음으로 간주하지 않는다.

## 백업과 복원

기존 일일 SQLite 백업은 `VACUUM INTO`로 스냅샷 DB를 만들고 그 DB의 모든 자료 버전이 참조하는 원본·썸네일을 함께 복사한다. 예를 들어 `backups/projectamo-20260910-2010.db` 옆에 `projectamo-20260910-2010.db.assets/`와 `manifest.json`이 생긴다. 파일명 SHA-256과 실제 내용이 다르거나 참조 파일이 빠지면 백업은 실패로 기록되고 불완전한 새 백업을 남기지 않는다. 보관기간 정리 시 두 항목을 같이 삭제한다.

DB와 `.assets` 디렉터리를 같은 백업 단위로 보관한다. 복원 검증은 존재하지 않는 새 경로에 수행한다.

```bash
node backend/restore-organization-backup.js \
  /secure-backup/projectamo-20260910-2010.db \
  /restore-check/projectamo.db \
  /restore-check/organization-files
```

복원기는 DB·개별 파일 무결성을 검증한 뒤 기록하며 기존 경로에는 덮어쓰지 않는다. 복원된 DB의 기관·자료 버전과 파일을 확인한 뒤, 운영 프로세스를 정지한 유지보수 작업에서 DB와 `ORGANIZATION_FILES_PATH`를 함께 전환한다. 기존 DB와 WAL/SHM은 보존하고 실행 중 DB 파일만 바꿔치기하지 않는다.

## 검증 명령

```bash
node --test backend/test/organization-backup.test.js backend/test/pinned-map-http.test.js
npm run dev:contract -- --config playwright.organization.config.js --grep organization-
node scripts/verify-organization-live.mjs
ORGANIZATION_VERIFY_BROWSER=1 node scripts/verify-organization-live.mjs
npm run check
```

회원 공유 흐름의 실제 로그인·서버·화면 확인은 `ORGANIZATION_SHARING_FOCUSED=1 node scripts/verify-organization-sharing.mjs`로 Chromium 데스크톱과 WebKit iPad 가로를 순차 실행한다. 계정·비행은 별도 artifacts DB의 합성 자료이고 기상은 로컬 수집 자료를 읽는다. 새 외부 수집 검증과 구분한다. CPU 사용량을 제한하려면 Linux `taskset -c <사용 가능한 코어>`와 `nice -n 10`을 함께 사용하고 다른 검증과 병렬 실행하지 않는다.

`verify-organization-live.mjs`는 최신 수집 자료를 읽는 명시적 실행 도구다. 임시 계정·기관·비행은 `artifacts/organization-lounge/live-http-*`의 별도 DB에 기록한다. 원본 기상 자료는 읽기 참조하고 수집은 실행하지 않는다. 결과의 `verifiedAt`, 각 자료 `fetchedAt`, `componentStatus`를 함께 확인한다. fixture 성공을 최신 외부 자료 성공으로 간주하지 않는다.

구현 진행·리뷰·화면 캡처와 남은 검증은 [구현 인계 기록](../design/proposals/2026-09-10-organization-lounge-progress.md)에 남긴다.
