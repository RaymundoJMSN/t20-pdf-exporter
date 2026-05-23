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

// Permissive shape — Foundry's Folder / Document / Compendium classes
// aren't typed in fvtt-types with enough detail for what we need.
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
  // Compendium folders carry their parent folder id under `folder` like a doc would.
  folder?: { id: string } | string | null;
};

type AnyPack = {
  collection?: string;
  metadata?: { label?: string; name?: string; id?: string };
  folders?: { get?: (id: string) => AnyFolder | undefined; contents?: AnyFolder[] };
  getDocuments: () => Promise<AnyDoc[]>;
};

export function registerBulkExport(): void {
  // Folder right-click (both world DocumentDirectory and CompendiumDirectory
  // folders). Single v13 hook.
  // @ts-expect-error fvtt-types doesn't narrow this hook to our handler shape
  Hooks.on("getFolderContextOptions", onFolderContextOptions);

  // Compendium pack-level right-click. v13's CompendiumDirectory doesn't fire
  // a documented hook for its entry context menu; the options list is built by
  // a protected `_getEntryContextOptions()` method on the directory class. We
  // monkey-patch the method on the prototype so every CompendiumDirectory
  // instance (Foundry only ever constructs one, but we run on `setup` which
  // fires before that) gets our entry added to whatever Foundry already
  // returns.
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
  // Idempotent — re-running registerBulkExport (HMR / module reload) shouldn't
  // stack multiple entries on the prototype.
  if ((proto._getEntryContextOptions as { _t20Patched?: boolean })._t20Patched) return;

  const patched = function (this: unknown): DirectoryContextEntry[] {
    const options = original.call(this) ?? [];
    options.push({
      name: "T20PDF.UI.ExportCompendiumZip",
      icon: '<i class="fas fa-file-archive"></i>',
      condition: (target) => Boolean(findPackFromTarget(target)),
      callback: (target) => {
        const pack = findPackFromTarget(target);
        if (pack) void exportPackAsZip(pack);
      },
    });
    return options;
  };
  (patched as { _t20Patched?: boolean })._t20Patched = true;
  proto._getEntryContextOptions = patched;
  console.log(`[${MODULE_ID}] CompendiumDirectory._getEntryContextOptions patched`);
}

function onFolderContextOptions(_app: unknown, options: DirectoryContextEntry[]): void {
  options.push({
    name: "T20PDF.UI.ExportFolderZip",
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
  // Compendium pack rows carry `data-pack="moduleId.packName"` (v13 v2 sidebar).
  // Some templates use `data-entry-id` with the pack collection — fall back.
  const el =
    target.closest<HTMLElement>("[data-pack]") ??
    target.closest<HTMLElement>("[data-entry-id]");
  if (!el) return null;
  const collection = el.dataset.pack ?? el.dataset.entryId;
  if (!collection) return null;
  return (game.packs?.get(collection) as unknown as AnyPack | undefined) ?? null;
}

/** Replace path-unsafe characters; trim leading/trailing whitespace and dots. */
function safeFileName(name: string | null | undefined): string {
  const s = (name ?? "untitled").trim().replace(/[\\/:*?"<>|]+/g, "_");
  return s.replace(/^[.\s]+|[.\s]+$/g, "") || "untitled";
}

/** Download a blob as a file with the given name. Mirrors Foundry's own
 *  `foundry.utils.saveDataToFile` pattern (plain Blob, anchor with
 *  `setAttribute("download", ...)`, brief setTimeout for cleanup), which is
 *  the version Foundry's per-document "Export Data" uses and the one that
 *  actually honors the `download` attribute in Electron. Earlier attempt
 *  wrapped the blob in a `File` constructor + set rel/target/display — that
 *  defeated the download attribute and made Electron save as the blob URL's
 *  UUID. Also caused a black-screen flash because Electron treated the click
 *  as a navigation. Don't reintroduce those. */
function downloadBlobAs(blob: Blob, filename: string): void {
  // Re-wrap as a fresh Blob with an explicit application/zip MIME so
  // Electron's downloader matches the extension.
  const wrapped =
    blob.type === "application/zip"
      ? blob
      : new Blob([blob], { type: "application/zip" });
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

// ────────────────────────────────────────────────────────────────────
// Folder export
// ────────────────────────────────────────────────────────────────────

async function exportFolderAsZip(folder: AnyFolder): Promise<void> {
  const zip = new JSZip();
  const rootName = safeFileName(folder.name);
  const root = zip.folder(rootName) ?? zip;

  ui.notifications?.info(
    game.i18n!.format("T20PDF.Notify.ExportingFolder", { name: folder.name ?? "" }),
  );

  try {
    const packDocsCache = new Map<string, AnyDoc[]>();
    await walkFolder(folder, root, packDocsCache);

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlobAs(blob, `${rootName}.zip`);

    ui.notifications?.info(
      game.i18n!.format("T20PDF.Notify.ExportedFolder", { name: folder.name ?? "" }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${MODULE_ID}] bulk export failed`, err);
    ui.notifications?.error(
      game.i18n!.format("T20PDF.Notify.ExportFolderFailed", { error: msg }),
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

// ────────────────────────────────────────────────────────────────────
// Compendium pack export — whole pack including its folder tree
// ────────────────────────────────────────────────────────────────────

async function exportPackAsZip(pack: AnyPack): Promise<void> {
  const label = pack.metadata?.label ?? pack.metadata?.name ?? "compendium";
  const rootName = safeFileName(label);
  const zip = new JSZip();
  const root = zip.folder(rootName) ?? zip;

  ui.notifications?.info(
    game.i18n!.format("T20PDF.Notify.ExportingFolder", { name: label }),
  );

  try {
    const allDocs = await pack.getDocuments();

    // Build folder lookup + a list of root-level folders (no parent).
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

    // Recursively populate the zip from the virtual root (parentId === null).
    writePackNode(root, null, childrenByParent, docsByFolder);

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlobAs(blob, `${rootName}.zip`);

    ui.notifications?.info(
      game.i18n!.format("T20PDF.Notify.ExportedFolder", { name: label }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${MODULE_ID}] compendium export failed`, err);
    ui.notifications?.error(
      game.i18n!.format("T20PDF.Notify.ExportFolderFailed", { error: msg }),
    );
  }
}

function writePackNode(
  zipFolder: JSZip,
  parentId: string | null,
  childrenByParent: Map<string | null, AnyFolder[]>,
  docsByFolder: Map<string | null, AnyDoc[]>,
): void {
  // Documents directly under this node.
  const usedFiles = new Set<string>();
  for (const d of docsByFolder.get(parentId) ?? []) {
    const fname = uniqueName(safeFileName(d.name), usedFiles);
    zipFolder.file(`${fname}.json`, JSON.stringify(d.toObject(), null, 2));
  }
  // Subfolders.
  const usedDirs = new Set<string>();
  for (const child of childrenByParent.get(parentId) ?? []) {
    const dirName = uniqueName(safeFileName(child.name), usedDirs);
    const sub = zipFolder.folder(dirName);
    if (!sub) continue;
    writePackNode(sub, child.id, childrenByParent, docsByFolder);
  }
}

// ────────────────────────────────────────────────────────────────────
// Tiny utility — id extraction that tolerates both shapes Foundry uses
// (string id or {id: string} object) for `.folder` parent refs.
// ────────────────────────────────────────────────────────────────────

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
