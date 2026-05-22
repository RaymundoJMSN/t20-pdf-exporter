import { CHARACTER_TYPE } from "../constants";
import { exportActor } from "./exporter";

type HeaderButton = { label: string; class: string; icon: string; onclick: () => void };

interface DirectoryContextEntry {
  name: string;
  icon: string;
  condition?: (li: JQuery) => boolean;
  callback: (li: JQuery) => void;
}

export function registerUI(): void {
  // @ts-expect-error fvtt-types missing this hook key for v13
  Hooks.on("getActorSheetHeaderButtons", onActorSheetHeader);
  // @ts-expect-error fvtt-types missing this hook key for v13
  Hooks.on("getActorDirectoryEntryContext", onActorDirectoryContext);
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

function onActorDirectoryContext(_html: JQuery, options: DirectoryContextEntry[]): void {
  options.push({
    name: "T20PDF.UI.ExportPDF",
    icon: '<i class="fas fa-file-pdf"></i>',
    condition: (li) => {
      const id = (li.data("documentId") ?? li.data("entityId")) as string | undefined;
      if (!id) return false;
      const actor = game.actors?.get(id);
      return (actor?.type as string) === CHARACTER_TYPE;
    },
    callback: (li) => {
      const id = (li.data("documentId") ?? li.data("entityId")) as string | undefined;
      if (!id) return;
      const actor = game.actors?.get(id);
      if (actor) void exportActor(actor);
    },
  });
}
