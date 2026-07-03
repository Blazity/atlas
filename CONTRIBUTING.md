# Contributing to Atlas Core

## Getting started

- Node >= 20
- `npm ci` to install dependencies
- `npm test` runs the full `node --test` suite — it must pass before any commit
- `npm run pack:smoke` verifies the npm tarball contents

## Running the CLI in development

ALWAYS run the local CLI inside this repo:

```sh
node bin/atlas.js <command>
# or
npm run atlas
```

Never run the published `npx @blazity-atlas/core` against this worktree. The
published `doctor --fix` would overwrite unreleased managed-skill edits with
the released versions (channel drift).

## Project layout

- `bin/` — CLI entrypoint
- `src/` — CLI implementation
- `skills/` — managed skill sources packaged into the npm tarball
- `test/` — `node:test` suites
- `.ai/` — this repo's own dogfooded Atlas workspace; resolve artifact
  destinations through `.ai/config.json` before writing plans, research, or
  decisions

## Commits

Conventional commits matching the existing `git log --oneline` style:
`type(scope): message`, first line only.

## Behavior contracts

- Doctor exit codes are a frozen public API: `0` clean, `1` fixable drift,
  `2` manual conflicts. Advisories never affect exit codes.
- Changes to managed skills under `skills/` change what ships to every
  consumer on the next release. Batch skill edits into one release and call
  them out in CHANGELOG.md.

## Documentation rules

Durable documentation records needs, decisions, and reasons — never
individuals or internal process. Keep personal names, private schedules, and
absolute local paths out of docs and workspace artifacts.
