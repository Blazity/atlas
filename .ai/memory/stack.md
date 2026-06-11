# Stack

- Node >=20, ESM (`"type": "module"`), no TypeScript.
- Single runtime dependency: `@clack/prompts`.
- Tests: `node:test` (`npm test` = `node --test`).
- Terminal styling: hand-rolled 24-bit ANSI theme in `src/ui/theme.js` — no chalk, no gradient-string.
- Package manager: npm with `package-lock.json`.
- `pack-smoke` test packs the real npm tarball and verifies it.
