# ModuloFoundry — Tormenta 20 PDF Exporter

Foundry VTT module that exports player characters from the **Tormenta 20** system (`tormenta20`) to PDF, so players can keep an offline copy of their sheet.

## Target

- **Foundry VTT:** v13 (build 351+). Use ApplicationV2 / HandlebarsApplicationMixin APIs. Do NOT add v11/v12 compat shims unless asked.
- **System:** `tormenta20` (Jeff Wittenhagen / community). Character actor type is `character`.
- **License:** MIT.
- **Distribution:** GitHub public release + manifest URL (planned, not set up yet).

## Stack

- **Language:** TypeScript (strict).
- **Bundler:** Vite (ES module output, single bundle into `dist/`).
- **Types:** `fvtt-types` (community Foundry typings) — pinned, may lag behind v13 in places. When a type is missing, prefer `// @ts-expect-error` with a comment over loosening tsconfig.
- **Lint/format:** Prettier only for now. Add ESLint if the codebase grows.
- **PDF library:** undecided — will be chosen when the export feature starts. Candidates: `pdf-lib` (fill an AcroForm template of the official sheet) vs `pdfmake`/`jsPDF` (generate layout from scratch). Default lean: `pdf-lib` because the official T20 sheet PDF is the user-expected output.

## Repo layout

```
module.json           Foundry manifest (id, version, compatibility, esmodules)
package.json          npm scripts + deps
vite.config.ts        Vite build config — outputs dist/module.js
tsconfig.json
src/
  module.ts           Entry. Registers hooks (init/ready/renderActorSheet).
  scripts/            Feature modules (exporter, settings, ui).
  styles/             SCSS/CSS, imported from module.ts.
  templates/          Handlebars templates for dialogs.
  lang/               en.json, pt-BR.json.
assets/               Static (icons, PDF templates).
dist/                 Build output. Gitignored.
```

Foundry loads the module from this directory when symlinked into `Data/modules/<id>/`. `module.json` points `esmodules` at `dist/module.js`.

## Conventions

- **Module id:** `t20-pdf-exporter`. Don't rename without updating `module.json`, the symlink, and any registered setting keys (those are namespaced by the id).
- **Language:** code and identifiers in English; user-facing strings in `lang/pt-BR.json` first (primary audience is BR T20 tables), with `en.json` mirroring keys.
- **Hooks:** register from `module.ts` only. Feature files export a `register()` function called from the entry.
- **Settings:** prefix all `game.settings.register` keys with the module id. Keep registration in `src/scripts/settings.ts`.
- **Actor access:** read sheet data via `actor.system.*` (T20 system schema). Never reach into private DOM of the sheet; if a value isn't in `system`, derive it from items (`actor.items`).
- **No global namespace pollution.** Attach anything that must be reachable from macros to `game.modules.get("t20-pdf-exporter").api`.

## Build & run

```bash
npm install
npm run build      # production bundle to dist/
npm run dev        # vite watch mode
```

To test in Foundry: symlink this folder into `<FoundryUserData>/Data/modules/t20-pdf-exporter`, enable the module in a world that uses the `tormenta20` system, reload.

## What's intentionally out of scope (for now)

- NPC export. Players want their own character sheet, not stat blocks.
- Multi-character batch export.
- Cloud/print services.
- Non-T20 systems. Hard-coded coupling to `tormenta20` is fine.

If the user asks to add any of the above, treat it as a new scope decision — don't smuggle generic abstractions in early to "leave room" for them.

## Working with this repo

- The user (Yuri) speaks Portuguese (pt-BR). Default to pt-BR for chat; keep code and commit messages in English.
- Foundry's API shifts between versions. Before writing against a hook, class, or method, verify it exists in v13 — check `fvtt-types` or the Foundry API docs at https://foundryvtt.com/api/. Don't trust pre-v13 examples from the web without confirming.
- The Tormenta 20 system's data schema lives in its system repo. When you need to know what fields exist on `actor.system`, inspect a live character in a Foundry world (`game.actors.getName(...).system` in the console) rather than guessing — the schema isn't fully documented.
