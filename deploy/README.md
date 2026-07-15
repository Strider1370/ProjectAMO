# Deploy Scripts

ProjectAMO 운영 배포 스크립트 정리입니다.

## Scripts

- `deploy-vm.sh`
  - fast deploy
  - frontend build + PM2 restart + nginx reload
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
