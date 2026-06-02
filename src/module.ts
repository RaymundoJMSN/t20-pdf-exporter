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
