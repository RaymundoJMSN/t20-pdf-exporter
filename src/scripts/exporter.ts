import { MODULE_ID, CHARACTER_TYPE } from "../constants";
import { buildAndOpenPDF } from "./pdf/exportPDF";
import { getTemplateSetting } from "./settings";

export async function exportActor(actor: Actor | undefined | null): Promise<void> {
  if (!actor) {
    ui.notifications?.warn(game.i18n!.localize("T20PDF.Notify.NoActor"));
    return;
  }
  if ((actor.type as string) !== CHARACTER_TYPE) {
    ui.notifications?.warn(game.i18n!.localize("T20PDF.Notify.NotCharacter"));
    return;
  }

  ui.notifications?.info(
    game.i18n!.format("T20PDF.Notify.Exporting", { name: actor.name ?? "" }),
  );

  try {
    await buildAndOpenPDF(actor, { template: getTemplateSetting() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${MODULE_ID}] PDF export failed`, err);
    ui.notifications?.error(
      game.i18n!.format("T20PDF.Notify.ExportFailed", { error: msg }),
    );
  }
}
