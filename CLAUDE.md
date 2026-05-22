# ModuloFoundry — Tormenta 20 PDF Exporter

Foundry VTT module that exports player characters from the **Tormenta 20** system (`tormenta20`) to PDF, so players can keep an offline copy of their sheet.

> Keep this file current. The user (Yuri) expects future sessions to be able to orient from CLAUDE.md alone — when you add a file, change a path, install a dependency, change the workflow, or make a non-obvious decision, update the relevant section here in the same change. Treat stale CLAUDE.md as a bug.

## Target

- **Foundry VTT:** v13 (build 351+). Use ApplicationV2 / HandlebarsApplicationMixin APIs where applicable. Do NOT add v11/v12 compat shims unless asked.
- **System:** `tormenta20` (community). Character actor type is `character` (string compared via cast — see "Types" below).
- **License:** MIT.
- **GitHub:** https://github.com/RaymundoJMSN/t20-pdf-exporter (public, `main` branch).

## Stack

- **Language:** TypeScript (strict).
- **Bundler:** Vite. Lib mode, ESM output, single bundle into `dist/module.js` + `dist/module.js.map`.
- **Types:** `fvtt-types` (community Foundry typings, pinned to GitHub `main`). Several v13 hook names and properties are missing from the typings. When that happens:
  - For unknown hook names: `// @ts-expect-error fvtt-types missing this hook key for v13` above the `Hooks.on(...)` call.
  - For `game.i18n`, `game.modules`, etc. typed `T | undefined` even though they exist after `init`: use non-null assertion `game.i18n!.localize(...)`.
  - For T20-specific actor types not in the typings (`character`): cast `actor.type as string` before comparison.
  - Prefer these targeted escapes over loosening `tsconfig.json`.
- **Lint/format:** Prettier only (`.prettierrc.json`).

## Repo layout

```
module.json           Foundry manifest. id = "t20-pdf-exporter", min/verified/max compat = v13.
package.json          npm scripts (build, dev, typecheck, format). Author = Yuri Lupalina.
package-lock.json     Tracked. If it disappears, regenerate with `npm install --package-lock-only`.
vite.config.ts        Lib build → dist/module.js. No CSS imported yet (styles entry removed from module.json).
tsconfig.json         strict, ES2022, types: ["fvtt-types"], noEmit.
.gitattributes        * text=auto eol=lf — repo normalises to LF on Windows.
.gitignore            node_modules/, dist/, .claude/, .env*, etc.
src/
  module.ts           Entry. Two hooks: init→registerUI, ready→registerAPI. Nothing else lives here.
  constants.ts        MODULE_ID, SYSTEM_ID, CHARACTER_TYPE. Import these — don't hardcode strings.
  scripts/
    exporter.ts       exportActor(actor) — the one handler all three entry points call. Currently a
                      placeholder: validates type, dumps actor/system/items to console, shows a notification.
                      Replace the dump-to-console block with the real PDF pipeline when the lib is picked.
    ui.ts             registerUI(). Hooks: getActorSheetHeaderButtons + getActorDirectoryEntryContext.
                      Both gated on actor.type === "character".
    api.ts            registerAPI(). Attaches { exportActor } to game.modules.get(MODULE_ID).api.
  styles/             Empty for now. If you add CSS, import it from module.ts AND restore the
                      "styles": ["dist/module.css"] entry in module.json — Vite will emit it.
  templates/          Empty. For Handlebars dialogs when needed.
  lang/
    pt-BR.json        Primary. All user-facing strings start here.
    en.json           Mirror. Same keys as pt-BR.
assets/               Static (icons, PDF templates) — empty until needed.
dist/                 Build output. Gitignored. Vite recreates it on every build.
```

## Three export entry points (current state)

All call `exportActor(actor)` in [src/scripts/exporter.ts](src/scripts/exporter.ts). Handler is **placeholder only** — logs to console and toasts a notification. No PDF yet.

| Entry point | File | Hook / API | How a user triggers it |
|---|---|---|---|
| Sheet header button | `src/scripts/ui.ts:onActorSheetHeader` | `getActorSheetHeaderButtons` | Open a PC's character sheet → button "Exportar PDF" in the title bar. |
| Actor directory context menu | `src/scripts/ui.ts:onActorDirectoryContext` | `getActorDirectoryEntryContext` | Right-click a PC in the Actors sidebar tab. |
| API | `src/scripts/api.ts:registerAPI` | `game.modules.get("t20-pdf-exporter").api.exportActor(actor)` | Macro or F12 console. |

The header button and context entry are gated by `actor.type === "character"`. NPCs and other actor types do not see the button. The API does the same check inside `exportActor` and notifies the user if the actor is wrong.

## Local install in Foundry

The module is installed via a **Windows directory junction** (no admin needed):

```
X:\FoundryVTT\Data\modules\t20-pdf-exporter   ->   E:\rayna\Documents\Claude\Projects\ModuloFoundry
```

User's Foundry user data dir is `X:\FoundryVTT\Data` (NOT the default `%LocalAppData%\FoundryVTT`). If you ever need to recreate the junction:

```powershell
New-Item -ItemType Junction `
  -Path   "X:\FoundryVTT\Data\modules\t20-pdf-exporter" `
  -Target "E:\rayna\Documents\Claude\Projects\ModuloFoundry"
```

Foundry only scans `Data/modules/` at process start — after creating the junction you must **fully quit and relaunch Foundry**, not just F5.

## Dev workflow

1. Terminal in the repo: `npm run dev` — Vite watches `src/`, rebuilds `dist/module.js` on save (~50 ms).
2. In Foundry, inside a world running `tormenta20`, after a code change: **F5** reloads the world and picks up the new bundle.
3. **F12** opens DevTools. Module logs `t20-pdf-exporter | init` and `| ready` on every world load.
4. F5 is NOT enough when you change `module.json`, `lang/*.json`, or anything Foundry reads at boot — for those, return to Setup and re-enter the world.

To inspect a live actor's schema in the console:

```js
const a = game.actors.getName("CharName");
console.log(a.system);
console.log(a.items.map(i => ({ name: i.name, type: i.type })));
```

The T20 schema is not publicly documented — this is how we learn what fields exist.

## Build & verify

```bash
npm run build      # production bundle to dist/
npm run typecheck  # tsc --noEmit, must pass
npm run dev        # vite watch (long-running)
npm run format     # prettier write
```

Keep `npm run typecheck` clean. If new fvtt-types friction shows up, escape it locally (see "Types" above) rather than disabling strict.

## Conventions

- **Module id:** `t20-pdf-exporter`. Changing it breaks the junction, the `module.json` id, and any `game.settings.register` keys (none registered yet).
- **No globals.** Anything macros need lives on `game.modules.get(MODULE_ID).api`.
- **Hooks register from `module.ts` only.** Feature files export a `register*()` function called from the entry.
- **Settings.** Not registered yet. When added, put them in `src/scripts/settings.ts` and call `registerSettings()` from `init`. All keys must be namespaced by the module id.
- **Language:** code & identifiers in English; user-facing strings in `lang/pt-BR.json` first, `en.json` mirrors.
- **Actor data:** always via `actor.system.*` and `actor.items`. Never scrape DOM from the T20 system's sheet.
- **Imports:** use `MODULE_ID`, `SYSTEM_ID`, `CHARACTER_TYPE` from `src/constants.ts`. Don't repeat string literals.

## What's intentionally out of scope (for now)

- NPC export.
- Multi-character / batch export.
- Cloud or print services.
- Non-T20 systems. Hard-coupling to `tormenta20` is fine.
- v11/v12 compatibility.
- CSS / custom dialog UI (no styles yet).

If the user asks to add any of the above, treat it as a new scope decision — don't smuggle generic abstractions in early to "leave room" for them.

## Open decisions

- **PDF library.** Undecided. Will be picked once we have a real `actor.system` dump from a complete T20 character. Candidates:
  - `pdf-lib` — load the official T20 sheet PDF, fill AcroForm fields. Output matches the printed sheet exactly. Hardest part is mapping system fields → form field names.
  - `pdfmake` / `jsPDF` — generate layout from scratch. More flexible, but the output won't look like the official sheet.
  - Default lean: `pdf-lib`, because players expect the official sheet.

## Working with this repo

- The user (Yuri, yuri@lupalina.com.br, GitHub `RaymundoJMSN`) speaks Portuguese (pt-BR). Default chat to pt-BR. Code and commit messages in English.
- Foundry's API shifts between versions. Before writing against a hook, class, or method, verify it exists in v13 — check `fvtt-types`, the Foundry API docs at https://foundryvtt.com/api/, or the running app in DevTools. Don't trust pre-v13 examples from the web without confirming.
- The Tormenta 20 system's data schema lives in its own repo. When you need to know what fields exist on `actor.system`, inspect a live character in a Foundry world (`game.actors.getName(...).system` in the console) rather than guessing.
- The user already approved the broad shape of this project (Foundry v13, Vite+TS, MIT, public GitHub, three export entry points). Don't re-ask those.
