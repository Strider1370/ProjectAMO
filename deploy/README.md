# Deploy Scripts

ProjectAMO 운영 배포 스크립트 정리입니다.

## Scripts

- `build-frontend.sh`
  - 프론트엔드 빌드 전용. 두 배포 스크립트가 공유한다
  - **새 폴더에 빌드하고 성공했을 때만 `dist`와 교체** — 빌드가 죽어도 사이트가 안 내려간다
  - Node 힙 한도를 올린다(`NODE_OPTIONS`로 덮어쓸 수 있음)

- `deploy-vm.sh`
  - fast deploy
  - pull → 자기 재시작 → frontend build → PM2 restart(설정 파일 지목) → nginx reload → 검증
  - 검증: 설정 적용 대조 + 백엔드 health + **화면 200**
  - package dependency 변경이 없을 때 사용

- `deploy-vm-full.sh`
  - full deploy
  - backend/frontend dependency install 포함
  - package lock 변경이나 새 런타임 dependency가 있을 때 사용

## Server Usage

운영 서버에서 실행:

```bash
cd /opt/projectamo/current
bash deploy/deploy-vm.sh
```

또는:

```bash
cd /opt/projectamo/current
bash deploy/deploy-vm-full.sh
```

`bash`로 실행하는 이유:

- 서버에 따라 스크립트 실행 권한이 안 붙어 있을 수 있기 때문입니다.

## Reference

상세 절차는 아래 문서를 봅니다.

- [`docs/operations/aws-ec2-manual-deploy.md`](../docs/operations/aws-ec2-manual-deploy.md)
