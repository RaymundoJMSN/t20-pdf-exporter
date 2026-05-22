# ModuloFoundry — Tormenta 20 PDF Exporter

Foundry VTT module that exports player characters from the **Tormenta 20** system (`tormenta20`) to PDF by filling an AcroForm template of the official-style sheet, so players can keep an offline copy.

> Keep this file current. The user (Yuri) expects future sessions to be able to orient from CLAUDE.md alone — when you add a file, change a path, install a dependency, change the workflow, or make a non-obvious decision, update the relevant section here in the same change. Treat stale CLAUDE.md as a bug.

## Target

- **Foundry VTT:** v13 (build 351+). Use ApplicationV2 / HandlebarsApplicationMixin APIs where applicable. Do NOT add v11/v12 compat shims unless asked.
- **System:** `tormenta20` (community). Character actor type is `character` (string compared via cast — see "Types" below).
- **License:** MIT.
- **GitHub:** https://github.com/RaymundoJMSN/t20-pdf-exporter (public, `main` branch).

## Stack

- **Language:** TypeScript (strict).
- **Bundler:** Vite, lib mode, ESM, single bundle into `dist/module.js`. `pdf-lib` is inlined (bundle ~560 kB, ~190 kB gzipped).
- **PDF lib:** [`pdf-lib`](https://pdf-lib.js.org/). We fill a pre-built AcroForm template from the [`gerador-ficha-tormenta20`](https://github.com/devsacanorpg/gerador-ficha-tormenta20) project. Templates live in `assets/templates/`.
- **Types:** `fvtt-types` (community Foundry typings, pinned to GitHub `main`). Some v13 hooks and T20-specific types are missing. When that happens:
  - For unknown hook names: `// @ts-expect-error fvtt-types missing this hook key for v13` above the `Hooks.on(...)` call.
  - For `game.i18n`, `game.modules`, etc. typed `T | undefined` even though they exist after `init`: use non-null assertion `game.i18n!.localize(...)`.
  - For T20-specific actor types not in the typings (`character`): cast `actor.type as string` before comparison.
  - Prefer these targeted escapes over loosening `tsconfig.json`.
- **Lint/format:** Prettier only (`.prettierrc.json`).

## Repo layout

```
module.json           Foundry manifest. id = "t20-pdf-exporter", min/verified/max compat = v13.
package.json          npm scripts (build, dev, typecheck, format). pdf-lib in deps, fvtt-types+vite+ts in devDeps.
package-lock.json     Tracked. If it disappears, regenerate with `npm install --package-lock-only`.
vite.config.ts        Lib build → dist/module.js. No CSS imported yet (styles entry removed from module.json).
tsconfig.json         strict, ES2022, types: ["fvtt-types"], noEmit.
.gitattributes        * text=auto eol=lf — repo normalises to LF on Windows.
.gitignore            node_modules/, dist/, .claude/, .env*, etc. (assets/ IS tracked — templates are runtime data.)
src/
  module.ts           Entry. Two hooks: init→registerUI, ready→registerAPI. Nothing else lives here.
  constants.ts        MODULE_ID, SYSTEM_ID, CHARACTER_TYPE. Import these — don't hardcode strings.
  scripts/
    exporter.ts       exportActor(actor) — handler the 3 entry points call. Validates actor.type, then
                      delegates to pdf/exportPDF.ts. Wraps errors as a user notification.
    ui.ts             registerUI(). Hooks:
                       - getActorSheetHeaderButtons → sheet header "Exportar PDF" button.
                       - getActorContextOptions    → v13 sidebar right-click entry. NOT getActorDirectoryEntryContext
                                                     — that's v11/v12. v13 ActorDirectory is ApplicationV2 and uses
                                                     the new naming. Callback receives an HTMLElement; read the
                                                     actor id from `.closest("[data-entry-id]").dataset.entryId`.
    api.ts            registerAPI(). Attaches { exportActor } to game.modules.get(MODULE_ID).api.
    pdf/
      exportPDF.ts    buildAndOpenPDF(actor, opts). Loads template via
                      fetch("modules/t20-pdf-exporter/assets/templates/sheet.pdf"), fills AcroForm fields
                      from actor.system + actor.items, opens result in a new browser tab (fallback download
                      if popup blocked). Field names + filling logic adapted from the standalone T20-DB
                      exporter (see "Credits"). Strips HTML from item descriptions, sanitizes to CP1252.
  styles/             Empty for now. If you add CSS, import it from module.ts AND restore the
                      "styles": ["dist/module.css"] entry in module.json — Vite will emit it.
  templates/          Empty. For Handlebars dialogs when needed (not the PDF templates — those live in assets/).
  lang/
    pt-BR.json        Primary. All user-facing strings start here.
    en.json           Mirror. Same keys as pt-BR.
assets/
  templates/
    sheet.pdf         Official-style ficha with decorative background (~3.8 MB).
    sheet-print.pdf   Same form fields, no background (saves ink) (~3.8 MB).
dist/                 Build output. Gitignored. Vite recreates it on every build.
```

## T20 actor schema — quick map

Foundry T20 stores characters as denormalized data on `actor.system` + `actor.items`. The PDF builder reads these directly (no compendium API calls). Useful paths:

| What | Where |
|---|---|
| Atributos (final) | `actor.system.atributos.{for,des,con,int,sab,car}.value` (fallback: `base + racial + bonus`) |
| Nível | `actor.system.attributes.nivel.value` |
| PV/PM (computed at runtime) | `actor.system.attributes.{pv,pm}.value` |
| Defesa | `actor.system.attributes.defesa.value` |
| Deslocamento | `actor.system.attributes.movement.{walk,fly,climb,burrow,swim}.base` |
| Perícias | `actor.system.pericias.{acro,ades,...,vont}.{value,treinado,atributo}` |
| Ofício (composto) | sub-keys: `alfa, alqu, arme, arte, cozi, enge` — MVP coalesces them into one "Ofício" line |
| Tracos | `actor.system.tracos.{tamanho, profArmaduras.value[], profArmas.value[], resistencias.*}` |
| Detalhes (textos livres) | `actor.system.detalhes.{origem, divindade, raca, biography.value}` |
| Itens | `actor.items.contents[]` — each has `.type` and `.system.*`. Types we read: `race`, `classe`, `equipamento`, `magia`, `poder`. |

Sample dumps lived in `E:\rayna\Downloads\fvtt-Actor-*.json` (Vidente/Oráculo, Ben 10, Conquista). When the schema is unclear, the user can re-export an actor as JSON from Foundry — right-click in the Actors sidebar → "Exportar Dados".

## Three export entry points

All call `exportActor(actor)` in [src/scripts/exporter.ts](src/scripts/exporter.ts), which delegates to `pdf/exportPDF.ts`.

| Entry point | File | Hook / API | How a user triggers it |
|---|---|---|---|
| Sheet header button | `src/scripts/ui.ts:onActorSheetHeader` | `getActorSheetHeaderButtons` | Open a PC's character sheet → button "Exportar PDF" in the title bar. |
| Actor directory context menu | `src/scripts/ui.ts:onActorContextOptions` | `getActorContextOptions` (v13) | Right-click a PC in the Actors sidebar tab. |
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

1. Terminal in the repo: `npm run dev` — Vite watches `src/`, rebuilds `dist/module.js` on save.
2. In Foundry, inside a world running `tormenta20`, after a code change: **F5** reloads the world and picks up the new bundle.
3. **F12** opens DevTools. Module logs `t20-pdf-exporter | init` and `| ready` on every world load.
4. F5 is NOT enough when you change `module.json`, `lang/*.json`, or anything Foundry reads at boot — for those, return to Setup and re-enter the world.
5. Templates (`assets/templates/*.pdf`) are fetched at runtime via relative URL `modules/t20-pdf-exporter/assets/templates/...`. They are NOT bundled into `dist/`. If you swap a template, no rebuild is needed — just F5.

To inspect a live actor's schema in the console:

```js
const a = game.actors.getName("CharName");
console.log(a.system);
console.log(a.items.contents.map(i => ({ name: i.name, type: i.type })));
```

## Build & verify

```bash
npm run build      # production bundle to dist/
npm run typecheck  # tsc --noEmit, must pass
npm run dev        # vite watch (long-running)
npm run format     # prettier write
```

Keep `npm run typecheck` clean. If new fvtt-types friction shows up, escape it locally (see "Types" above) rather than disabling strict.

## Conventions

- **Module id:** `t20-pdf-exporter`. Changing it breaks the junction, the `module.json` id, the template fetch URL (`modules/t20-pdf-exporter/...`), and any `game.settings.register` keys (none registered yet).
- **No globals.** Anything macros need lives on `game.modules.get(MODULE_ID).api`.
- **Hooks register from `module.ts` only.** Feature files export a `register*()` function called from the entry.
- **Settings.** Not registered yet. When added, put them in `src/scripts/settings.ts` and call `registerSettings()` from `init`. All keys must be namespaced by the module id.
- **Language:** code & identifiers in English; user-facing strings in `lang/pt-BR.json` first, `en.json` mirrors.
- **Actor data:** always via `actor.system.*` and `actor.items`. Never scrape DOM from the T20 system's sheet.
- **Imports:** use `MODULE_ID`, `SYSTEM_ID`, `CHARACTER_TYPE` from `src/constants.ts`. Don't repeat string literals.
- **Item descriptions are HTML.** When putting them on the PDF, strip tags first (see `sanitize()` in `pdf/exportPDF.ts`) and then sanitize to CP1252 (pdf-lib default fonts are WinAnsi only).
- **Foundry enrichment markers.** Descriptions also contain `@UUID[...]{Label}`, `@Compendium[...]{Label}`, `@Embed[...]`, `@Check[...]`, `@Roll[...]` patterns. `sanitize()` strips these BEFORE the HTML pass, keeping the `{Label}` text when present and dropping the marker entirely when it has no label. Add new patterns to that single regex if Foundry adds more.
- **Code-to-label lookup tables.** T20 stores many fields as 3-letter codes (`arc`, `lev`, `enc`, `inst`, …). All display-name maps live near the top of `pdf/exportPDF.ts` (`MAGIA_TIPO`, `MAGIA_ESCOLA`, `MAGIA_EXECUCAO`, `MAGIA_ALCANCE`, `MAGIA_DURACAO_UNITS`, `PROF_ARMADURA`, `PROF_ARMA`, `ATR_FULL`). Use `lookupOrTitle(map, code)` — if the code isn't in the map it falls back to a title-cased version of the raw code so unknown values still render legibly.

## PDF template fields (key reference)

Templates inherit from the [`gerador-ficha-tormenta20`](https://github.com/devsacanorpg/gerador-ficha-tormenta20) project. Critical fields filled today:

- Header: `Nome`, `Raca`, `Classe`, `Origem`, `Divindade`.
- Atributos: `modFor/Des/Con/Int/Sab/Car` (modifier with sign).
- Combat block: `vidaMax`, `manaMax`, `Texto13` (defesa), `metadeDoNivel`, dropdown `modDef` defaulted to `modDes`.
- `deslocamento` (base walk + extras).
- Carga: `cargaAtual`, `cargaMaxima` (5 + Força), `levantar` (×2).
- Inventário: `item1` (first 1000 chars), `item2` (next 1000).
- Perícias: 29 rows, alphabetical. Per row index N (0-based):
  - Total: `total{N+1}` (template has a typo `tota23` at N=22 — handled).
  - Treinamento: `treino{N}`.
  - Outros: `outros{N+1}` (always "0" in MVP).
  - Dropdown atributo-chave: `modSelect{N}`.
  - Checkbox treinada: `treinado{N+1}`.
- Magias: `Atualização` (auto-sized 8–12pt by length). Each magia rendered as a block:
  - Header: `• Nome (Tipo Nºº, Escola, custo PM)`.
  - Detail line (pipe-separated): `Execução: X | Alcance: Y | Alvo: Z | Duração: W | Resistência: T (CD N)`. CD = `10 + ⌊nivel/2⌋ + mod(atributo de conjuração do personagem)`. Conjuração lê de `actor.system.attributes.conjuracao`.
  - Description (HTML + Foundry enrichment stripped via `sanitize`).
  - `Aprimoramentos:` line followed by indented `  N PM: <desc>` for each entry in `item.effects` that has `flags.tormenta20.custo` set. Effects without a `custo` flag are state effects (e.g. "Magia (Cena)"), not upgrades — skipped.
- Poderes + habilidades: `Historico` (auto-sized).
- Proficiências: `caracteristicas`. Codes mapped via `PROF_ARMADURA` / `PROF_ARMA`. Output groups: `Armaduras: Leve, Pesada, Escudo` / `Armas: Simples, Marcial`.

Known gaps (intentional MVP):
- Armas / armaduras don't fill dedicated `ataque{1..5}` / `armadura{1..2}` slots — everything is dumped into the inventory blob.
- Skill totals trust `actor.system.pericias.*.value` (Foundry computed); we don't recompute bonuses from items.
- Ofício composto: we union the 6 sub-skills into one line — won't show separate trained sub-perícias.

## What's intentionally out of scope (for now)

- NPC export.
- Multi-character / batch export.
- Cloud or print services.
- Non-T20 systems. Hard-coupling to `tormenta20` is fine.
- v11/v12 compatibility.
- CSS / custom dialog UI (no styles yet).
- Custom PDF templates picked at runtime by GM. We always use the bundled `sheet.pdf` / `sheet-print.pdf`.

If the user asks to add any of the above, treat it as a new scope decision — don't smuggle generic abstractions in early to "leave room" for them.

## Credits

- **PDF template + form field naming:** [`gerador-ficha-tormenta20`](https://github.com/devsacanorpg/gerador-ficha-tormenta20) (MIT).
- **Initial filling logic:** adapted from the standalone `T20-DB` PDF exporter (also Yuri's project, at `E:\rayna\Documents\Claude\Projects\Ideias e RPG\T20-DB\dist-pdf-exportador\`). That version assumed a database-shaped `PersonagemCompleto` with IDs resolved via API. This module reads denormalized Foundry actor data directly, so the `ApiPDF` interface is gone.

## Working with this repo

- The user (Yuri, yuri@lupalina.com.br, GitHub `RaymundoJMSN`) speaks Portuguese (pt-BR). Default chat to pt-BR. Code and commit messages in English.
- Foundry's API shifts between versions. Before writing against a hook, class, or method, verify it exists in v13 — check `fvtt-types`, the Foundry API docs at https://foundryvtt.com/api/, or the running app in DevTools. Don't trust pre-v13 examples from the web without confirming.
- The Tormenta 20 system's data schema lives in its own repo. When you need to know what fields exist on `actor.system`, inspect a live character in a Foundry world (`game.actors.getName(...).system` in the console) or have the user export an actor as JSON via the sidebar context menu.
- The user already approved the broad shape of this project (Foundry v13, Vite+TS, MIT, public GitHub, three export entry points, pdf-lib + sheet template). Don't re-ask those.
