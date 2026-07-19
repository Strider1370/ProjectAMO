# Browser verification

Use this policy when changing a browser-visible feature or its contract.

- Select the affected contract from [the contract registry](contracts.md), and confirm its viewport, preconditions, and entry flow before editing.
- Locate controls in this order only: role, label, text, then test id. Do not use CSS paths, XPath, or positional selectors.
- Re-confirm the target after a screen transition. If a required accessible name is absent, record the needed `data-testid`; do not work around it with a CSS selector.
- Run browser and server mutations serially. After the second failure of the same flow, stop repeating it and use the saved evidence to classify the cause.
- Report implementation completion separately from end-to-end completion. A contract is end-to-end complete only when its managed command passes for every listed project.
