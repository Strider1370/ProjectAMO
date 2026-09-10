# Browser verification

The [contract registry](contracts.md) lists supported features, viewports, fixtures, and entry flows.

- Run a focused contract with `npm run dev:contract -- --grep <contract-id>`.
- The managed command owns its fixed-data backend and frontend and reports Playwright results for the contract's configured projects.
- A passing result covers only the cases and projects actually executed. An embedded preview is not a test result.
- Accessible roles, labels, and stable test IDs support reliable selectors; scope locators to the owning panel when names overlap.
- Server startup, readiness checks, and screenshot commands are documented in the [development server guide](../../operations/dev-server-and-capture.md).
