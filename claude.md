# ProjectAMO agent entrypoint

Read [the policy index](docs/policies/index.md) and the relevant `Architecture.md` section before editing. Follow the index's matching detailed policy; for ambiguous work, read up to two and re-check routing if exploration crosses a boundary.

Fallback when policy routing or a hook is unavailable: use `AGENTS.md`, `Architecture.md`, and [the policy index](docs/policies/index.md); hooks never replace these documents.

- State material assumptions, make the smallest approved change, and verify the result.
- Read [encoding safety](docs/policies/encoding-safety.md) before encoding-sensitive edits; use `apply_patch` for manual text changes.
- Before broad code reading, use graphify when the repository graph exists. Graph results guide exploration only; run `graphify update .` after code changes.
- Browser-visible work requires Playwright verification and [the dev-server procedure](docs/operations/dev-server-and-capture.md).
- For long or multi-domain work, use [long-context lifecycle guidance](docs/policies/long-context.md).
- Follow [delivery and completion](docs/policies/verification/delivery-and-completion.md) for finish, commit, push, or PR requests.
