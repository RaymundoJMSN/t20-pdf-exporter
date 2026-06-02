# Repo Split Design: t20-pdf-exporter + foundry-bulk-exporter

**Date:** 2026-06-02  
**Status:** Approved

## Goal

Split `ModuloFoundry` into two independent Foundry VTT modules:

1. **t20-pdf-exporter** — existing repo, T20-specific PDF exporter (no changes to PDF pipeline)
2. **foundry-bulk-exporter** — new repo, system-agnostic bulk JSON-to-ZIP exporter

## Approach

Hard cut (Approach A). No git history migration. Two standalone modules, no shared code, no monorepo.

## What Changes in `t20-pdf-exporter` (current repo)

- Delete `src/scripts/bulk-export.ts`
- Remove `registerBulkExport()` call from `src/module.ts`
- Remove bulk-export lang strings from `lang/pt-BR.json` and `lang/en.json`
- Update `CLAUDE.md`: remove "Bulk-export folders" section, update repo description
- Commit: `chore: remove bulk-export (moved to foundry-bulk-exporter module)`

Nothing else changes. PDF pipeline untouched.

## New Repo: `foundry-bulk-exporter`

### Location

- Disk: `E:\rayna\Documents\Claude\Projects\foundry-bulk-exporter`
- GitHub: `RaymundoJMSN/foundry-bulk-exporter` (public)
- Foundry junction: `X:\FoundryVTT\Data\modules\foundry-bulk-exporter` → disk path above

### Stack

Same as current repo: TypeScript strict, Vite lib mode → `dist/module.js`, fvtt-types devDep. `jszip` in deps (inlined). No `pdf-lib`. No system restriction in `module.json`.

### File Structure

```
foundry-bulk-exporter/
  module.json            id="foundry-bulk-exporter", title="Foundry Bulk Exporter"
                         v13 compat, no system restriction
  package.json           jszip in deps; fvtt-types+vite+ts+prettier in devDeps
  vite.config.ts         lib mode → dist/module.js (jszip inlined)
  tsconfig.json          strict, ES2022, types: ["fvtt-types"]
  .gitattributes         * text=auto eol=lf
  .gitignore             node_modules/, dist/, .claude/, etc.
  .prettierrc.json       copy from current
  src/
    constants.ts         MODULE_ID = "foundry-bulk-exporter"
    module.ts            entry: setup hook → registerBulkExport()
    scripts/
      bulk-export.ts     adapted from current: uses new MODULE_ID, no T20 imports
  lang/
    pt-BR.json           bulk-export strings only
    en.json              mirror
```

### Source Adaptation (`bulk-export.ts`)

- Replace `import { MODULE_ID } from "../constants"` with local constants path (same structure)
- Remove any T20-specific references (none exist — file is already system-agnostic)
- Keep all logic: `registerBulkExport()`, folder context hook, compendium monkey-patch, `downloadBlobAs()`

### Setup Sequence

1. `npm install` in new dir
2. `git init && git add -A && git commit -m "feat: initial foundry-bulk-exporter module"`
3. `gh repo create RaymundoJMSN/foundry-bulk-exporter --public --source=. --remote=origin --push`
4. Create junction: `New-Item -ItemType Junction -Path "X:\FoundryVTT\Data\modules\foundry-bulk-exporter" -Target "E:\rayna\Documents\Claude\Projects\foundry-bulk-exporter"`
5. Restart Foundry, enable module

## Out of Scope

- Shared npm package / library extraction
- History migration via `git filter-repo`
- Any changes to PDF pipeline
- Monorepo structure
