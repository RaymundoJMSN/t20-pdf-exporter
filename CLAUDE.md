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
- **Bundler:** Vite, lib mode, ESM, single bundle into `dist/module.js`. `pdf-lib` and `jszip` are inlined (bundle ~715 kB, ~230 kB gzipped).
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
                      reads the user's template choice (via settings.getTemplateSetting) and delegates
                      to pdf/exportPDF.ts. Wraps errors as a user notification.
    settings.ts       registerSettings() + getTemplateSetting(). Registers one world-scope client setting
                      `t20-pdf-exporter.pdfTemplate` ("completa" | "impressao", default "completa") that
                      shows up in Game Settings → Configure Settings → Tormenta 20 — Exportador de PDF.
    bulk-export.ts    registerBulkExport(). Adds two ZIP-export entries to the sidebar context menus:
                      - "Exportar pasta (ZIP)" on every folder via `getFolderContextOptions` (covers
                        both world DocumentDirectory and CompendiumDirectory folders).
                      - "Exportar compêndio (ZIP)" on every compendium pack via the
                        `getCompendiumDirectoryEntryContext` hook (legacy name still emitted in v13)
                        with `getCompendiumDirectoryContextOptions` registered as a backup alias.
                      Walks the relevant tree, serializes each document with `doc.toObject()` into
                      one JSON file, and mirrors the folder hierarchy as ZIP directories. For pack
                      export the folder tree is rebuilt from `pack.folders.contents[]` using each
                      folder's `.folder` parent reference. Documents and folder ids cached per pack.
                      Downloads via `downloadBlobAs(blob, filename)` — wraps the blob in a `File`
                      object so the Electron Save-As dialog uses the real filename instead of the
                      blob URL's UUID. ZIP name = root folder name (or `pack.metadata.label`).
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
    sheet.pdf                  Official-style ficha with decorative background (~3.8 MB). 3 pages:
                               page 0 = header/atributos/perícias, page 1 = poderes (Historico field),
                               page 2 = magias (Atualização field).
    sheet-print.pdf            Same 3 pages, no background (saves ink) (~3.8 MB).
    sheet_poderes.pdf          1-page overflow template for poderes (decorative). Contains a Historico
                               field at the same rect as the main page's; we copy this page, strip its
                               form-field annotations, and drawText the overflow chunk in the field rect.
    sheet_magias.pdf           1-page overflow template for magias (decorative). Same idea, Atualização field.
    sheet-print_poderes.pdf    Print-variant overflow page for poderes.
    sheet-print_magias.pdf     Print-variant overflow page for magias.
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
| Itens | `actor.items.contents[]` — each has `.type` and `.system.*`. Types we read: `race`, `classe`, `arma`, `equipamento`, `consumivel`, `tesouro`, `magia`, `poder`. |
| Carga (runtime) | `actor.system.attributes.carga.{value, limit, max}` — already computed by the T20 system (accounts for size, equipped vs carregado, mods). The source JSON dump shows zeros; trust runtime. Fallback only when all three are zero: `5 + Força` as max, sum `espacos*qtd` across gear as current. |

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
- **Settings.** Registered in [src/scripts/settings.ts](src/scripts/settings.ts), wired from `module.ts:init`. Current keys (all namespaced under `t20-pdf-exporter.`):
  - `pdfTemplate` — `"completa"` | `"impressao"`, world scope, drives which template the exporter loads. Read via `getTemplateSetting()` rather than `game.settings.get` directly so the fallback default lives in one place.
  When adding a new setting: append both `register` block and a typed getter to `settings.ts`, add lang keys (`T20PDF.Settings.<Key>.Name/Hint/Choice…`) to both `pt-BR.json` and `en.json`, then read via the getter.
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
- Carga: `cargaAtual`, `cargaMaxima`, `levantar`. Read from `actor.system.attributes.carga.{value, limit, max}` at runtime. `levantar` = `max × 2` per T20.
- Inventário: two text boxes `item1` and `item2`. Source = `equipamento` (excluding armor) + `consumivel` + `tesouro`, each section prefixed by a heading line ("Equipamentos:" / "Consumíveis:" / "Tesouros e Itens:"). Armas go to dedicated ataque slots, armaduras to armadura slots. **Split by LINE, not by char** — fills `item1` until either 24 lines or 950 chars (whichever first), then `item2` under the same caps. Whatever doesn't fit spills to the annex page "Continuação do inventário". Avoids mid-word cuts.
- Armas (até 5): `tAtak{N}` (nome), `ataque{N}` (+bônus computado), `dano{N}` (formula com `@for/@des/...` resolvido), `critico{N}` ("19/x2"), `alcance{N}` (Curto/Médio/Longo/—), `tipo{N}` (Impacto/Corte/Perfuração/Cura PV/elemental). Bônus de ataque = `meio_nivel + atributoMod(skillAtr) + treinamento(skillKey) + bonus_da_rolagem`. `skillKey` vem de `item.system.rolls[].parts[1]` (luta/pontaria/etc); `skillAtr` mapeia via `pericias[skillKey].atributo` (luta→for, pontaria→des).
- Armaduras (até 2): `armadura{N}` (nome), `defesa{N}` (`item.system.armadura.value`), `penalidade{N}` (`item.system.armadura.penalidade`). Filtro: `equipamento.system.tipo ∈ {leve, pes, pesada, esc, escudo}`.
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

## Overflow handling

Form-field text in the template clips around `MAIN_FIELD_CAP` (3000 chars) even after auto-font-shrinking to 8pt. When a character has many poderes or magias, the content is split at the last newline before that cap. The first chunk fills the original `Historico`/`Atualização` field as usual; the rest goes onto dedicated overflow pages.

**Poderes & magias — dedicated overflow templates.**
- Powered by `appendOverflowTemplatePages(pdfDoc, srcBytes, text, insertAtIdx, baseFieldName)` and `insertOverflowTemplatePage(...)` in [src/scripts/pdf/exportPDF.ts](src/scripts/pdf/exportPDF.ts).
- Chunking is done by **visual lines** (after wrap at the field's width), not by char count. `chunkByVisualLines(text, font, size, maxWidth, maxLines)` walks the source lines, wraps each via `wrapLine` to measure how many on-page lines it consumes, and starts a new chunk whenever the next source line would push the page past `POD_MAG_LINES_PER_PAGE` (40 lines @ 14pt — the empirically-tested cap before content gets cut at the bottom of the field rect). Source-line boundaries are always honored, so a chunk never ends mid sentence.
- For each chunk, copies a page from `sheet_poderes.pdf` / `sheet_magias.pdf` (or the print variants when the user picked "impressao"), strips its `/Annots` so the duplicated `Historico`/`Atualização` widget doesn't shadow-write the main sheet, inserts the copy at the right index, then **creates a fresh multi-line text field** at the same rect (`OVERFLOW_RECT = (35.5, 43.3) → (536.8, 717.0)`) with a unique name `${baseFieldName}_ovr_${chunkIdx}`. The freshly-created field is editable in the viewer and uses the pdf-lib default Helvetica, matching the look of the main page's field instead of looking like baked-in text.
- **Fixed font size 14pt** (`POD_MAG_FONT_SIZE`) on both main and overflow Historico/Atualização — no auto-shrinking — so a printed character with many poderes/magias sees the same text size across every page. Newly-created overflow fields need a `/DA` (default appearance) entry seeded before `setFontSize`; otherwise pdf-lib throws "No /DA entry found". `forceFontSize(field, size)` tries `setFontSize` and, on failure, seeds `/Helv {size} Tf 0 0 0 rg` then retries.
- Width measurement uses pdf-lib's embedded `StandardFonts.Helvetica` widths. The PDF viewer (Foundry/PDF.js, Chrome, Acrobat) may render its own Helvetica with slightly different metrics, so `POD_MAG_INNER_PADDING` (8pt of inset on each side of the rect) leaves a safety margin. If users still report content cut at the bottom, lower `POD_MAG_LINES_PER_PAGE`; if they report wasted whitespace, raise it.
- Insertion order: **poderes first** (after the main poderes page at index 1), then magias appended after the original magias page at index `2 + podPagesAdded`. This keeps the visual order header → poderes → poderes-overflow* → magias → magias-overflow*.

**Inventário & armas extras — plain annex pages.**
There's no dedicated overflow template for these, so they still use `appendAnnexPages(pdfDoc, title, body)` — plain A4 pages with Helvetica text drawn from a top-left margin. These are always appended *last* (after any poderes/magias overflow). If you ever want a decorative inventory overflow page, add a `sheet_inventario.pdf` (+ print variant) and follow the poderes/magias pattern.

Known gaps (intentional MVP):
- Skill totals trust `actor.system.pericias.*.value` (Foundry computed); we don't recompute bonuses from items.
- Ofício composto: we union the 6 sub-skills into one line — won't show separate trained sub-perícias.
- Weapon attack bonus assumes the skill atributo is the canonical one for that skill (luta→for, pontaria→des). Doesn't honor character-level skill atributo overrides via `actor.system.pericias[skill].atributo` overrides set by GMs.

## Bulk-export folders (companion feature)

Distinct from the PDF export pipeline. Right-click any sidebar/compendium folder OR any compendium pack → "Exportar pasta (ZIP)" / "Exportar compêndio (ZIP)" → downloads a ZIP that mirrors the folder hierarchy, with each document serialized to a JSON file (same shape as Foundry's per-document "Exportar Dados"). Subfolders become ZIP subdirectories recursively. Implemented in [src/scripts/bulk-export.ts](src/scripts/bulk-export.ts):
- Folder right-click uses `getFolderContextOptions` (single v13 hook for both `DocumentDirectory` and `CompendiumDirectory` folders).
- Compendium pack right-click uses `getCompendiumDirectoryEntryContext` (legacy name) plus `getCompendiumDirectoryContextOptions` as a backup alias — neither is in `fvtt-types`, so both registrations carry `@ts-expect-error`. Whichever Foundry build is loaded picks up the right one.
- Pack export reads `pack.folders.contents[]` for the folder tree and rebuilds it via each folder's `.folder` parent reference, then groups `pack.getDocuments()` by `doc.folder`.

Implementation notes:
- File names are derived from `doc.name`; collisions inside the same folder get a `(2)`, `(3)` suffix. Path-unsafe characters (`\\ / : * ? " < > |`) are replaced with `_`.
- `downloadBlobAs(blob, filename)` wraps the ZIP blob in a `File` before creating the object URL — without that wrapper, Electron's Save-As dialog falls back to the blob URL's UUID for the filename even with `<a download>` set. The anchor stays in the DOM for 1 second after click before cleanup to keep the click event handler alive in slower builds.

> The module id is still `t20-pdf-exporter` (named when the only feature was the PDF builder). The bulk-export feature is system-agnostic. If we ever add more general-purpose features, consider renaming — but renaming breaks the junction, every existing user's setting key, and the Foundry installation flow.

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
