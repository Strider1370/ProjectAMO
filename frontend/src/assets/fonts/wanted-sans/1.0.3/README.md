# Wanted Sans 1.0.3

Unmodified variable split webfont distribution from wanteddev/wanted-sans,
pinned to the version served by the previous jsDelivr `@latest` URL on
2026-09-11. Keeping the same files preserves existing glyphs and metrics.

- Upstream: https://github.com/wanteddev/wanted-sans
- Source: https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.css
- License: `OFL.txt`, also shipped at `/licenses/wanted-sans-OFL-1.1.txt`.
- `manifest.json` records the source and SHA-256 of the CSS, license and every
  woff2 file. Tests verify these before build/deployment.

The app imports this CSS only when the Wanted preference is selected. Vite
rewrites its relative font URLs to hashed, same-origin `/assets/` files.
Do not edit the font binaries or remove Unicode ranges based on current UI text.
An upstream upgrade must update the version directory, import, license and
manifest together and repeat the font rendering checks.
