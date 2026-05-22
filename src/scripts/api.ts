import { MODULE_ID } from "../constants";
import { exportActor } from "./exporter";

export interface T20PDFApi {
  exportActor: (actor: Actor | undefined | null) => Promise<void>;
}

export function registerAPI(): T20PDFApi {
  const api: T20PDFApi = { exportActor };
  const module = game.modules!.get(MODULE_ID) as (Module & { api?: T20PDFApi }) | undefined;
  if (module) module.api = api;
  return api;
}
