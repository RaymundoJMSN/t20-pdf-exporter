// ────────────────────────────────────────────────────────────────────
// Bulk export — right-click a Folder (world or compendium) and export
// every document inside it (and inside its subfolders, recursively) as
// a ZIP file. The ZIP mirrors the folder hierarchy: each subfolder
// becomes a directory in the archive, each document becomes a JSON
// file named after the document, equivalent to Foundry's "Export Data"
// on a single document.
//
// Works on Sidebar DocumentDirectory folders (Actors, Items, Journals,
// Scenes, Macros, Playlists, RollTables, Cards) and on CompendiumDirectory
// folders (folders inside compendium packs).
// ────────────────────────────────────────────────────────────────────

import JSZip from "jszip";
import { MODULE_ID } from "../constants";

interface DirectoryContextEntry {
  name: string;
  icon: string;
  callback: (target: HTMLElement) => void;
  condition?: (target: HTMLElement) => boolean;
}

// Permissive shape — Foundry's Folder and Document classes aren't in
// fvtt-types with enough detail for what we need.
type AnyDoc = {
  id: string;
  name: string | null;
  folder?: { id: string } | null;
  toObject: () => Record<string, unknown>;
};

type AnyFolder = {
  id: string;
  name: string | null;
  pack?: string | null;
  type?: string;
  contents?: AnyDoc[];
  children?: Array<{ folder?: AnyFolder } | AnyFolder>;
};

type AnyPack = {
  metadata?: { label?: string; name?: string };
  getDocuments: () => Promise<AnyDoc[]>;
};

export function registerBulkExport(): void {
  // @ts-expect-error fvtt-types doesn't narrow this hook to our handler shape
  Hooks.on("getFolderContextOptions", onFolderContextOptions);
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
  // v13 sidebar folder rows carry data-folder-id.
  const el = target.closest<HTMLElement>("[data-folder-id]");
  const id = el?.dataset.folderId;
  if (!id) return null;
  // game.folders is the world-scope collection. For compendium folders we
  // walk the pack-side folder tree.
  const worldFolder = game.folders?.get(id);
  if (worldFolder) return worldFolder as unknown as AnyFolder;
  // Compendium folder fallback — find which pack the folder belongs to.
  const packs = game.packs?.contents ?? [];
  for (const pack of packs as AnyPack[]) {
    // @ts-expect-error pack.folders is a Collection
    const cf = pack.folders?.get?.(id) as AnyFolder | undefined;
    if (cf) return cf;
  }
  return null;
}

/** Replace path-unsafe characters; trim leading/trailing whitespace and dots. */
function safeFileName(name: string | null | undefined): string {
  const s = (name ?? "untitled").trim().replace(/[\\/:*?"<>|]+/g, "_");
  return s.replace(/^[.\s]+|[.\s]+$/g, "") || "untitled";
}

async function exportFolderAsZip(folder: AnyFolder): Promise<void> {
  const zip = new JSZip();
  const rootName = safeFileName(folder.name);
  const root = zip.folder(rootName) ?? zip;

  ui.notifications?.info(
    game.i18n!.format("T20PDF.Notify.ExportingFolder", { name: folder.name ?? "" }),
  );

  try {
    // Resolve documents up-front for compendium folders (single API call per pack).
    const packDocsCache = new Map<string, AnyDoc[]>();
    await walkFolder(folder, root, packDocsCache);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rootName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

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
  // Resolve documents in this folder.
  const docs = await getDocumentsInFolder(folder, packDocsCache);
  const usedNames = new Set<string>();
  for (const doc of docs) {
    const baseName = safeFileName(doc.name);
    let name = baseName;
    let n = 1;
    while (usedNames.has(name)) {
      name = `${baseName} (${++n})`;
    }
    usedNames.add(name);
    const json = JSON.stringify(doc.toObject(), null, 2);
    zipFolder.file(`${name}.json`, json);
  }

  // Recurse into children. Folder.children in v13 is typed differently
  // across world/compendium folders; normalize both shapes.
  const children = (folder.children ?? []) as Array<{ folder?: AnyFolder } | AnyFolder>;
  const usedSubNames = new Set<string>();
  for (const childEntry of children) {
    const child = (childEntry as { folder?: AnyFolder }).folder ?? (childEntry as AnyFolder);
    if (!child || !child.id) continue;
    const baseName = safeFileName(child.name);
    let name = baseName;
    let n = 1;
    while (usedSubNames.has(name)) {
      name = `${baseName} (${++n})`;
    }
    usedSubNames.add(name);
    const childZip = zipFolder.folder(name);
    if (!childZip) continue;
    await walkFolder(child, childZip, packDocsCache);
  }
}

async function getDocumentsInFolder(
  folder: AnyFolder,
  cache: Map<string, AnyDoc[]>,
): Promise<AnyDoc[]> {
  if (folder.pack) {
    // Compendium folder — pull all pack docs (cached) and filter by folder id.
    let all = cache.get(folder.pack);
    if (!all) {
      const pack = game.packs?.get(folder.pack) as unknown as AnyPack | undefined;
      all = pack ? await pack.getDocuments() : [];
      cache.set(folder.pack, all);
    }
    return all.filter((d) => d.folder?.id === folder.id);
  }
  // World folder — contents is already populated.
  return folder.contents ?? [];
}
