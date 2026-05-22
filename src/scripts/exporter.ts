import { MODULE_ID, CHARACTER_TYPE } from "../constants";

export async function exportActor(actor: Actor | undefined | null): Promise<void> {
  if (!actor) {
    ui.notifications?.warn(game.i18n!.localize("T20PDF.Notify.NoActor"));
    return;
  }
  if ((actor.type as string) !== CHARACTER_TYPE) {
    ui.notifications?.warn(game.i18n!.localize("T20PDF.Notify.NotCharacter"));
    return;
  }

  console.group(`[${MODULE_ID}] exportActor: ${actor.name}`);
  console.log("actor", actor);
  console.log("system", actor.system);
  console.log(
    "items",
    actor.items.map((i) => ({ name: i.name, type: i.type })),
  );
  console.groupEnd();

  ui.notifications?.info(
    game.i18n!.format("T20PDF.Notify.PlaceholderExport", { name: actor.name ?? "" }),
  );
}
