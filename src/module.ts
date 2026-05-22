import { MODULE_ID } from "./constants";
import { registerAPI } from "./scripts/api";
import { registerBulkExport } from "./scripts/bulk-export";
import { registerSettings } from "./scripts/settings";
import { registerUI } from "./scripts/ui";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerSettings();
  registerUI();
  registerBulkExport();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  registerAPI();
});
