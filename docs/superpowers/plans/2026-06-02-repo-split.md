# Repo Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `ModuloFoundry` into two independent Foundry VTT modules — `t20-pdf-exporter` (PDF pipeline only) and `foundry-bulk-exporter` (ZIP bulk export, system-agnostic).

**Architecture:** Hard cut — no shared code, no history migration. `bulk-export.ts` is removed from the current repo and recreated in the new repo with updated lang key prefix (`FBE.` instead of `T20PDF.`). Both repos are standalone Vite+TS builds targeting Foundry v13.

**Tech Stack:** TypeScript strict, Vite lib mode, fvtt-types, jszip (new repo only), pdf-lib (stays in current repo only). GitHub CLI (`gh`) for remote setup. PowerShell junction for Foundry dev install.

---

## File Map

### Repo 1: `t20-pdf-exporter` (current repo — deletions/edits only)

| Action | File |
|--------|------|
| Edit | `src/module.ts` |
| Delete | `src/scripts/bulk-export.ts` |
| Edit | `src/lang/pt-BR.json` |
| Edit | `src/lang/en.json` |
| Edit | `CLAUDE.md` |

### Repo 2: `foundry-bulk-exporter` (new repo at `E:\rayna\Documents\Claude\Projects\foundry-bulk-exporter`)

| Action | File |
|--------|------|
| Create | `package.json` |
| Create | `module.json` |
| Create | `vite.config.ts` |
| Create | `tsconfig.json` |
| Create | `.gitattributes` |
| Create | `.gitignore` |
| Create | `.prettierrc.json` |
| Create | `src/constants.ts` |
| Create | `src/module.ts` |
| Create | `src/scripts/bulk-export.ts` |
| Create | `src/lang/pt-BR.json` |
| Create | `src/lang/en.json` |

---

## Task 1: Strip bulk-export from `t20-pdf-exporter`

**Working directory:** `E:\rayna\Documents\Claude\Projects\ModuloFoundry`

**Files:**
- Edit: `src/module.ts`
- Delete: `src/scripts/bulk-export.ts`
- Edit: `src/lang/pt-BR.json`
- Edit: `src/lang/en.json`
- Edit: `CLAUDE.md`

- [ ] **Step 1: Edit `src/module.ts` — remove bulk-export import and call**

Replace the entire file with:

```typescript
import { MODULE_ID } from "./constants";
import { registerAPI } from "./scripts/api";
import { registerSettings } from "./scripts/settings";
import { registerUI } from "./scripts/ui";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerSettings();
  registerUI();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  registerAPI();
});
```

- [ ] **Step 2: Delete `src/scripts/bulk-export.ts`**

```powershell
Remove-Item "src\scripts\bulk-export.ts"
```

- [ ] **Step 3: Edit `src/lang/pt-BR.json` — remove 5 bulk-export keys**

Replace the entire file with:

```json
{
  "T20PDF.ModuleTitle": "Tormenta 20 — Exportador de PDF",
  "T20PDF.UI.ExportPDF": "Exportar PDF",
  "T20PDF.Notify.NoActor": "Nenhum personagem selecionado.",
  "T20PDF.Notify.NotCharacter": "Só personagens jogáveis podem ser exportados.",
  "T20PDF.Notify.Exporting": "Gerando PDF de {name}…",
  "T20PDF.Notify.ExportFailed": "Falha ao exportar PDF: {error}",
  "T20PDF.Settings.Template.Name": "Template de PDF",
  "T20PDF.Settings.Template.Hint": "Escolhe qual ficha usar como base. 'Completa' tem o fundo decorativo. 'Impressão' tem fundo branco, mais econômico para imprimir.",
  "T20PDF.Settings.Template.ChoiceCompleta": "Completa (com fundo decorativo)",
  "T20PDF.Settings.Template.ChoiceImpressao": "Impressão (sem fundo, economiza tinta)"
}
```

- [ ] **Step 4: Edit `src/lang/en.json` — remove 5 bulk-export keys**

Replace the entire file with:

```json
{
  "T20PDF.ModuleTitle": "Tormenta 20 — PDF Exporter",
  "T20PDF.UI.ExportPDF": "Export PDF",
  "T20PDF.Notify.NoActor": "No actor selected.",
  "T20PDF.Notify.NotCharacter": "Only player characters can be exported.",
  "T20PDF.Notify.Exporting": "Generating PDF for {name}…",
  "T20PDF.Notify.ExportFailed": "PDF export failed: {error}",
  "T20PDF.Settings.Template.Name": "PDF Template",
  "T20PDF.Settings.Template.Hint": "Which sheet to use as the base. 'Complete' has the decorative background. 'Print' has a plain background, ink-friendly.",
  "T20PDF.Settings.Template.ChoiceCompleta": "Complete (with decorative background)",
  "T20PDF.Settings.Template.ChoiceImpressao": "Print (no background, saves ink)"
}
```

- [ ] **Step 5: Update `CLAUDE.md`**

In `CLAUDE.md`, remove the entire "Bulk-export folders (companion feature)" section (the block starting with `## Bulk-export folders (companion feature)` down to but not including `## What's intentionally out of scope`).

Also remove from `src/scripts/bulk-export.ts` line in the repo layout table and from the scripts listing under `src/scripts/`.

Add a note under `## What's intentionally out of scope`:
```
- Bulk JSON/ZIP export. Moved to separate module: `foundry-bulk-exporter`.
```

- [ ] **Step 6: Typecheck**

```powershell
npm run typecheck
```

Expected: no errors. If errors appear they will reference the deleted `bulk-export` import — ensure Step 1 was applied correctly.

- [ ] **Step 7: Build**

```powershell
npm run build
```

Expected: `dist/module.js` produced, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/module.ts src/lang/pt-BR.json src/lang/en.json CLAUDE.md
git rm src/scripts/bulk-export.ts
git commit -m "chore: remove bulk-export (moved to foundry-bulk-exporter module)"
```

---

## Task 2: Scaffold `foundry-bulk-exporter` repo

**Working directory:** `E:\rayna\Documents\Claude\Projects\foundry-bulk-exporter` (create it)

- [ ] **Step 1: Create directory**

```powershell
New-Item -ItemType Directory -Path "E:\rayna\Documents\Claude\Projects\foundry-bulk-exporter"
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "foundry-bulk-exporter",
  "version": "0.1.0",
  "description": "Foundry VTT module — export folders and compendium packs to ZIP.",
  "type": "module",
  "private": true,
  "author": {
    "name": "Yuri Lupalina",
    "email": "yuri@lupalina.com.br"
  },
  "license": "MIT",
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch --mode development",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.{ts,json}\""
  },
  "devDependencies": {
    "fvtt-types": "github:League-of-Foundry-Developers/foundry-vtt-types#main",
    "prettier": "^3.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.10"
  },
  "dependencies": {
    "jszip": "^3.10.1"
  }
}
```

- [ ] **Step 3: Create `module.json`**

```json
{
  "id": "foundry-bulk-exporter",
  "title": "Foundry Bulk Exporter",
  "description": "Right-click any folder or compendium pack to download its documents as a ZIP archive, mirroring the folder hierarchy.",
  "version": "0.1.0",
  "compatibility": {
    "minimum": "13",
    "verified": "13",
    "maximum": "13"
  },
  "authors": [
    {
      "name": "RaymundoJMSN",
      "email": "raimundojmdsn@gmail.com"
    }
  ],
  "esmodules": ["dist/module.js"],
  "languages": [
    {
      "lang": "pt-BR",
      "name": "Português (Brasil)",
      "path": "src/lang/pt-BR.json"
    },
    {
      "lang": "en",
      "name": "English",
      "path": "src/lang/en.json"
    }
  ],
  "url": "https://github.com/RaymundoJMSN/foundry-bulk-exporter",
  "license": "LICENSE",
  "readme": "README.md"
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import { resolve } from "node:path";

const MODULE_ID = "foundry-bulk-exporter";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    lib: {
      entry: resolve(__dirname, "src/module.ts"),
      name: MODULE_ID,
      fileName: () => "module.js",
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        assetFileNames: (asset) =>
          asset.name === "style.css" ? "module.css" : "assets/[name][extname]",
      },
    },
  },
});
```

- [ ] **Step 5: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["fvtt-types"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "esModuleInterop": false,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "vite.config.ts"]
}
```

- [ ] **Step 6: Create `.gitattributes`**

```
* text=auto eol=lf
```

- [ ] **Step 7: Create `.gitignore`**

```
node_modules/
dist/
.claude/
.env*
*.local
```

- [ ] **Step 8: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 9: Create `src/constants.ts`**

```typescript
export const MODULE_ID = "foundry-bulk-exporter";
```

- [ ] **Step 10: Create `src/lang/pt-BR.json`**

```json
{
  "FBE.ModuleTitle": "Foundry Bulk Exporter",
  "FBE.UI.ExportFolderZip": "Exportar pasta (ZIP)",
  "FBE.UI.ExportCompendiumZip": "Exportar compêndio (ZIP)",
  "FBE.Notify.ExportingFolder": "Compactando \"{name}\"…",
  "FBE.Notify.ExportedFolder": "Pasta \"{name}\" exportada.",
  "FBE.Notify.ExportFolderFailed": "Falha ao exportar pasta: {error}"
}
```

- [ ] **Step 11: Create `src/lang/en.json`**

```json
{
  "FBE.ModuleTitle": "Foundry Bulk Exporter",
  "FBE.UI.ExportFolderZip": "Export folder (ZIP)",
  "FBE.UI.ExportCompendiumZip": "Export compendium (ZIP)",
  "FBE.Notify.ExportingFolder": "Zipping \"{name}\"…",
  "FBE.Notify.ExportedFolder": "Folder \"{name}\" exported.",
  "FBE.Notify.ExportFolderFailed": "Folder export failed: {error}"
}
```

- [ ] **Step 12: Create `src/module.ts`**

```typescript
import { MODULE_ID } from "./constants";
import { registerBulkExport } from "./scripts/bulk-export";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerBulkExport();
});
```

- [ ] **Step 13: Create `src/scripts/bulk-export.ts`**

Same logic as the original — only differences are the `MODULE_ID` import path and lang key prefix (`FBE.` instead of `T20PDF.`):

```typescript
// ────────────────────────────────────────────────────────────────────
// Bulk export — right-click a Folder (world or compendium) OR a
// whole compendium pack and download every document inside (and
// inside its subfolders, recursively) as a ZIP file. The ZIP mirrors
// the folder hierarchy: each subfolder becomes a directory in the
// archive, each document becomes a JSON file named after it,
// equivalent to Foundry's "Export Data" on a single document.
// ────────────────────────────────────────────────────────────────────

import JSZip from "jszip";
import { MODULE_ID } from "../constants";

interface DirectoryContextEntry {
  name: string;
  icon: string;
  callback: (target: HTMLElement) => void;
  condition?: (target: HTMLElement) => boolean;
}

type AnyDoc = {
  id: string;
  name: string | null;
  folder?: { id: string } | string | null;
  toObject: () => Record<string, unknown>;
};

type AnyFolder = {
  id: string;
  name: string | null;
  pack?: string | null;
  type?: string;
  contents?: AnyDoc[];
  children?: Array<{ folder?: AnyFolder } | AnyFolder>;
  folder?: { id: string } | string | null;
};

type AnyPack = {
  collection?: string;
  metadata?: { label?: string; name?: string; id?: string };
  folders?: { get?: (id: string) => AnyFolder | undefined; contents?: AnyFolder[] };
  getDocuments: () => Promise<AnyDoc[]>;
};

export function registerBulkExport(): void {
  // @ts-expect-error fvtt-types doesn't narrow this hook to our handler shape
  Hooks.on("getFolderContextOptions", onFolderContextOptions);
  Hooks.once("setup", patchCompendiumDirectoryContext);
}

interface CompendiumDirectoryClass {
  prototype: {
    _getEntryContextOptions?: () => DirectoryContextEntry[];
  };
}

function patchCompendiumDirectoryContext(): void {
  const ns = (globalThis as { foundry?: Record<string, unknown> }).foundry;
  const sidebarTabs = (ns?.applications as Record<string, unknown> | undefined)?.sidebar as
    | Record<string, unknown>
    | undefined;
  const tabs = sidebarTabs?.tabs as Record<string, unknown> | undefined;
  const CompendiumDirectory = tabs?.CompendiumDirectory as CompendiumDirectoryClass | undefined;
  if (!CompendiumDirectory?.prototype) {
    console.warn(`[${MODULE_ID}] CompendiumDirectory not found — pack export skipped`);
    return;
  }
  const proto = CompendiumDirectory.prototype;
  const original = proto._getEntryContextOptions;
  if (!original) {
    console.warn(`[${MODULE_ID}] _getEntryContextOptions missing — pack export skipped`);
    return;
  }
  if ((proto._getEntryContextOptions as { _fbePpatched?: boolean })._fbePpatched) return;

  const patched = function (this: unknown): DirectoryContextEntry[] {
    const options = original.call(this) ?? [];
    options.push({
      name: "FBE.UI.ExportCompendiumZip",
      icon: '<i class="fas fa-file-archive"></i>',
      condition: (target) => Boolean(findPackFromTarget(target)),
      callback: (target) => {
        const pack = findPackFromTarget(target);
        if (pack) void exportPackAsZip(pack);
      },
    });
    return options;
  };
  (patched as { _fbePpatched?: boolean })._fbePpatched = true;
  proto._getEntryContextOptions = patched;
  console.log(`[${MODULE_ID}] CompendiumDirectory._getEntryContextOptions patched`);
}

function onFolderContextOptions(_app: unknown, options: DirectoryContextEntry[]): void {
  options.push({
    name: "FBE.UI.ExportFolderZip",
    icon: '<i class="fas fa-file-archive"></i>',
    condition: (target) => Boolean(findFolderFromTarget(target)),
    callback: (target) => {
      const folder = findFolderFromTarget(target);
      if (folder) void exportFolderAsZip(folder);
    },
  });
}

function findFolderFromTarget(target: HTMLElement): AnyFolder | null {
  const el = target.closest<HTMLElement>("[data-folder-id]");
  const id = el?.dataset.folderId;
  if (!id) return null;
  const worldFolder = game.folders?.get(id);
  if (worldFolder) return worldFolder as unknown as AnyFolder;
  const packs = (game.packs?.contents ?? []) as unknown as AnyPack[];
  for (const pack of packs) {
    const cf = pack.folders?.get?.(id);
    if (cf) return cf;
  }
  return null;
}

function findPackFromTarget(target: HTMLElement): AnyPack | null {
  const el =
    target.closest<HTMLElement>("[data-pack]") ??
    target.closest<HTMLElement>("[data-entry-id]");
  if (!el) return null;
  const collection = el.dataset.pack ?? el.dataset.entryId;
  if (!collection) return null;
  return (game.packs?.get(collection) as unknown as AnyPack | undefined) ?? null;
}

function safeFileName(name: string | null | undefined): string {
  const s = (name ?? "untitled").trim().replace(/[\\/:*?"<>|]+/g, "_");
  return s.replace(/^[.\s]+|[.\s]+$/g, "") || "untitled";
}

interface FsAccessSaveOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}
interface FsAccessFileHandle {
  createWritable: () => Promise<{
    write: (data: Blob | ArrayBuffer | Uint8Array | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}
type ShowSaveFilePicker = (opts: FsAccessSaveOptions) => Promise<FsAccessFileHandle>;

async function downloadBlobAs(blob: Blob, filename: string): Promise<void> {
  const wrapped =
    blob.type === "application/zip"
      ? blob
      : new Blob([blob], { type: "application/zip" });

  const showSave = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;
  if (typeof showSave === "function") {
    try {
      const handle = await showSave({
        suggestedName: filename,
        types: [
          {
            description: "ZIP archive",
            accept: { "application/zip": [".zip"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(wrapped);
      await writable.close();
      return;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      console.warn(`[${MODULE_ID}] showSaveFilePicker failed, falling back to anchor`, err);
    }
  }

  const url = URL.createObjectURL(wrapped);
  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

async function exportFolderAsZip(folder: AnyFolder): Promise<void> {
  const zip = new JSZip();
  const rootName = safeFileName(folder.name);
  const root = zip.folder(rootName) ?? zip;

  ui.notifications?.info(
    game.i18n!.format("FBE.Notify.ExportingFolder", { name: folder.name ?? "" }),
  );

  try {
    const packDocsCache = new Map<string, AnyDoc[]>();
    await walkFolder(folder, root, packDocsCache);

    const blob = await zip.generateAsync({ type: "blob" });
    await downloadBlobAs(blob, `${rootName}.zip`);

    ui.notifications?.info(
      game.i18n!.format("FBE.Notify.ExportedFolder", { name: folder.name ?? "" }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${MODULE_ID}] bulk export failed`, err);
    ui.notifications?.error(
      game.i18n!.format("FBE.Notify.ExportFolderFailed", { error: msg }),
    );
  }
}

async function walkFolder(
  folder: AnyFolder,
  zipFolder: JSZip,
  packDocsCache: Map<string, AnyDoc[]>,
): Promise<void> {
  const docs = await getDocumentsInFolder(folder, packDocsCache);
  const usedNames = new Set<string>();
  for (const doc of docs) {
    const fname = uniqueName(safeFileName(doc.name), usedNames);
    const json = JSON.stringify(doc.toObject(), null, 2);
    zipFolder.file(`${fname}.json`, json);
  }

  const children = (folder.children ?? []) as Array<{ folder?: AnyFolder } | AnyFolder>;
  const usedSubNames = new Set<string>();
  for (const childEntry of children) {
    const child = (childEntry as { folder?: AnyFolder }).folder ?? (childEntry as AnyFolder);
    if (!child || !child.id) continue;
    const subName = uniqueName(safeFileName(child.name), usedSubNames);
    const childZip = zipFolder.folder(subName);
    if (!childZip) continue;
    await walkFolder(child, childZip, packDocsCache);
  }
}

async function getDocumentsInFolder(
  folder: AnyFolder,
  cache: Map<string, AnyDoc[]>,
): Promise<AnyDoc[]> {
  if (folder.pack) {
    let all = cache.get(folder.pack);
    if (!all) {
      const pack = game.packs?.get(folder.pack) as unknown as AnyPack | undefined;
      all = pack ? await pack.getDocuments() : [];
      cache.set(folder.pack, all);
    }
    return all.filter((d) => docFolderId(d) === folder.id);
  }
  return folder.contents ?? [];
}

async function exportPackAsZip(pack: AnyPack): Promise<void> {
  const label = pack.metadata?.label ?? pack.metadata?.name ?? "compendium";
  const rootName = safeFileName(label);
  const zip = new JSZip();
  const root = zip.folder(rootName) ?? zip;

  ui.notifications?.info(
    game.i18n!.format("FBE.Notify.ExportingFolder", { name: label }),
  );

  try {
    const allDocs = await pack.getDocuments();

    const allFolders = (pack.folders?.contents ?? []) as AnyFolder[];
    const childrenByParent = new Map<string | null, AnyFolder[]>();
    for (const f of allFolders) {
      const parentId = folderParentId(f);
      const arr = childrenByParent.get(parentId) ?? [];
      arr.push(f);
      childrenByParent.set(parentId, arr);
    }

    const docsByFolder = new Map<string | null, AnyDoc[]>();
    for (const d of allDocs) {
      const fid = docFolderId(d);
      const arr = docsByFolder.get(fid) ?? [];
      arr.push(d);
      docsByFolder.set(fid, arr);
    }

    writePackNode(root, null, childrenByParent, docsByFolder);

    const blob = await zip.generateAsync({ type: "blob" });
    await downloadBlobAs(blob, `${rootName}.zip`);

    ui.notifications?.info(
      game.i18n!.format("FBE.Notify.ExportedFolder", { name: label }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${MODULE_ID}] compendium export failed`, err);
    ui.notifications?.error(
      game.i18n!.format("FBE.Notify.ExportFolderFailed", { error: msg }),
    );
  }
}

function writePackNode(
  zipFolder: JSZip,
  parentId: string | null,
  childrenByParent: Map<string | null, AnyFolder[]>,
  docsByFolder: Map<string | null, AnyDoc[]>,
): void {
  const usedFiles = new Set<string>();
  for (const d of docsByFolder.get(parentId) ?? []) {
    const fname = uniqueName(safeFileName(d.name), usedFiles);
    zipFolder.file(`${fname}.json`, JSON.stringify(d.toObject(), null, 2));
  }
  const usedDirs = new Set<string>();
  for (const child of childrenByParent.get(parentId) ?? []) {
    const dirName = uniqueName(safeFileName(child.name), usedDirs);
    const sub = zipFolder.folder(dirName);
    if (!sub) continue;
    writePackNode(sub, child.id, childrenByParent, docsByFolder);
  }
}

function docFolderId(d: AnyDoc): string | null {
  const f = d.folder;
  if (!f) return null;
  return typeof f === "string" ? f : (f.id ?? null);
}

function folderParentId(f: AnyFolder): string | null {
  const p = f.folder;
  if (!p) return null;
  return typeof p === "string" ? p : (p.id ?? null);
}

function uniqueName(base: string, used: Set<string>): string {
  let name = base;
  let n = 1;
  while (used.has(name)) name = `${base} (${++n})`;
  used.add(name);
  return name;
}
```

- [ ] **Step 14: Install dependencies**

```powershell
cd "E:\rayna\Documents\Claude\Projects\foundry-bulk-exporter"
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 15: Typecheck**

```powershell
npm run typecheck
```

Expected: no errors.

- [ ] **Step 16: Build**

```powershell
npm run build
```

Expected: `dist/module.js` produced (~small, only jszip inlined), no errors.

- [ ] **Step 17: Init git and make initial commit**

```bash
git init
git add .
git commit -m "feat: initial foundry-bulk-exporter module"
```

---

## Task 3: GitHub remote + Foundry junction

- [ ] **Step 1: Create GitHub repo and push**

```bash
gh repo create RaymundoJMSN/foundry-bulk-exporter --public --source=. --remote=origin --push
```

Expected: repo created at `https://github.com/RaymundoJMSN/foundry-bulk-exporter`, initial commit pushed.

- [ ] **Step 2: Create Foundry junction**

```powershell
New-Item -ItemType Junction `
  -Path   "X:\FoundryVTT\Data\modules\foundry-bulk-exporter" `
  -Target "E:\rayna\Documents\Claude\Projects\foundry-bulk-exporter"
```

Expected: junction created. No output = success. Verify:

```powershell
Get-Item "X:\FoundryVTT\Data\modules\foundry-bulk-exporter" | Select-Object LinkType, Target
```

Expected: `LinkType = Junction`, `Target = E:\rayna\Documents\Claude\Projects\foundry-bulk-exporter`.

- [ ] **Step 3: Verify in Foundry**

1. Fully quit and relaunch Foundry (not just F5 — Foundry scans modules at process start).
2. In Setup → Add-on Modules: verify `Foundry Bulk Exporter` appears.
3. Enter a world, enable the module in Module Management.
4. F5 to reload.
5. Right-click any folder in any sidebar tab → confirm "Exportar pasta (ZIP)" entry appears.
6. Right-click a compendium pack row → confirm "Exportar compêndio (ZIP)" entry appears.
7. Export a small folder and verify the ZIP downloads with the correct filename.
8. Confirm `t20-pdf-exporter` still shows "Exportar PDF" on actor sheets and that PDF export works.
