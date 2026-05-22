import { CHARACTER_TYPE } from "../constants";
import { exportActor } from "./exporter";

type HeaderButton = { label: string; class: string; icon: string; onclick: () => void };

interface DirectoryContextEntry {
  name: string;
  icon: string;
  callback: (target: HTMLElement) => void;
  condition?: (target: HTMLElement) => boolean;
}

export function registerUI(): void {
  // @ts-expect-error fvtt-types missing this hook key for v13
  Hooks.on("getActorSheetHeaderButtons", onActorSheetHeader);
  // @ts-expect-error fvtt-types narrows callback signature; we accept HTMLElement target
  Hooks.on("getActorContextOptions", onActorContextOptions);
}

function onActorSheetHeader(app: ActorSheet, buttons: HeaderButton[]): void {
  const actor = app.actor;
  if ((actor?.type as string) !== CHARACTER_TYPE) return;

  buttons.unshift({
    label: game.i18n!.localize("T20PDF.UI.ExportPDF"),
    class: "t20-pdf-export",
    icon: "fas fa-file-pdf",
    onclick: () => void exportActor(actor),
  });
}

function getActorFromTarget(target: HTMLElement): Actor | undefined {
  // v13 sidebar entries carry data-entry-id on the .directory-item / .document element.
  const el = target.closest<HTMLElement>("[data-entry-id]") ?? target;
  const id = el.dataset?.entryId ?? el.dataset?.documentId;
  if (!id) return undefined;
  return game.actors?.get(id) ?? undefined;
}

function onActorContextOptions(_app: unknown, options: DirectoryContextEntry[]): void {
  options.push({
    name: "T20PDF.UI.ExportPDF",
    icon: '<i class="fas fa-file-pdf"></i>',
    condition: (target) => {
      const actor = getActorFromTarget(target);
      return (actor?.type as string) === CHARACTER_TYPE;
    },
    callback: (target) => {
      const actor = getActorFromTarget(target);
      if (actor) void exportActor(actor);
    },
  });
}
