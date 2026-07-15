# Delivery and completion

## Applies when

Browser-visible work, local-server use, Playwright capture, deployment, finish, commit, push, or pull-request preparation is requested.

## Does not apply when

Read-only analysis or an isolated change that has no applicable delivery or completion action.

## Re-check trigger

Re-check when the requested Git action changes, runtime behavior becomes browser-visible, or deployment artifacts/configuration change.

## Verification and deployment

- For local servers, browser work, and Playwright screenshots, follow [the dev-server and capture procedure](../../operations/dev-server-and-capture.md). Browser-visible behavior requires Playwright evidence, not an embedded preview.
- For EC2 operations and expected runtime behavior, use [operations](../../operations/operations.md). For manual deployment and script selection, use [the EC2 deployment guide](../../operations/aws-ec2-manual-deploy.md) and [the deploy README](../../../deploy/README.md).
- Preserve the documented readiness, post-deploy, cache, and rollback/recovery checks appropriate to the change; do not reproduce their commands here.

## Advisory closeout

Finish, commit, push, and PR requests are advisory closeout signals. From the current context, recommend only applicable verification, policy-index/entrypoint synchronization, temporary-file handling, status completion/archive, and deployment checks. Require the user's acceptance before running extra checks, and record explicitly skipped checks in the final report or active status record.
