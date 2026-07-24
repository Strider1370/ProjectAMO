# ProjectAMO policies

<!-- SESSION-ROUTING:START -->
# ProjectAMO policy routing

Read the relevant `Architecture.md` section and this index before editing. For routine work, read one matching detailed policy; if two boundaries plausibly apply, read both and no unrelated policy.

Process (planning, TDD, debugging, review, branch closeout) is owned by the superpowers skills — see [the entrypoint](../../claude.md). This index routes project-specific boundaries only.

| Work | Minimum Architecture.md read | Read next |
| --- | --- | --- |
| Standalone route, route-briefing payload, developer console | `Directory Structure`, `Reference Structure` | [recurring entry sequences](engineering/entry-sequences.md) |
| Add or change an en-route briefing data layer | `File Roles` -> `Backend`, `Reference Structure` | [route briefing source contract](engineering/route-briefing-source-contract.md) |
| Timestamps, KMA/KIM data, data contracts, collectors | `File Roles` — `Backend`, `Reference Structure` | [data and time](engineering/data-and-time.md) |
| MapView, Mapbox, overlay, visibility, timeline | `File Roles` — `Frontend` map entries, `Reference Structure` | [map and layers](engineering/map-and-layers.md) |
| UI, CSS, responsive layout | `File Roles` — affected frontend feature, `Reference Structure` | [design language](design/design-language.md) |
| Browser verification | `Directory Structure` — `scripts` and the affected feature's `File Roles` entry | [browser verification](verification/browser-verification.md), [contract registry](verification/contracts.md) |
| Deploy, finish, commit, push, PR | `Directory Structure` — `scripts` | [operations](../operations/operations.md); use the `finishing-a-development-branch` skill |

Read [encoding safety](encoding-safety.md) before encoding-sensitive edits.
<!-- SESSION-ROUTING:END -->

## Policy directory

- Engineering: [recurring entry sequences](engineering/entry-sequences.md), [route briefing source contract](engineering/route-briefing-source-contract.md), [data and time](engineering/data-and-time.md), and [map and layers](engineering/map-and-layers.md).
- Design: [design language](design/design-language.md).
- Verification: [browser verification](verification/browser-verification.md) and [the contract registry](verification/contracts.md).
- File integrity: [encoding safety](encoding-safety.md).

## Admission and routing

Put a rule here only when it protects a central boundary or is cross-cutting, changes implementation behavior, and has repeated code evidence or an explicit project decision. Keep local details with their module, test, or operational reference.

Route twice: select candidate policies from the request, then re-check this index before editing if exploration exposes another boundary. Read at most two plausible detailed policies; ask only when the remaining choice changes scope, cost, or behavior.

## Maintenance

When a standing rule, task pattern, decision, design rule, or verification procedure changes, update this index and every affected entrypoint or forwarding reference in the same change. Remove superseded guidance only after its replacement and inbound references are verified.
