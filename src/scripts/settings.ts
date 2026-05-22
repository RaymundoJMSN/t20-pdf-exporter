import { MODULE_ID } from "../constants";
import type { PDFTemplate } from "./pdf/exportPDF";

export const SETTING_TEMPLATE = "pdfTemplate";

const DEFAULT_TEMPLATE: PDFTemplate = "completa";

export function registerSettings(): void {
  // @ts-expect-error fvtt-types narrows settings to known module ids; ours isn't registered
  game.settings.register(MODULE_ID, SETTING_TEMPLATE, {
    name: "T20PDF.Settings.Template.Name",
    hint: "T20PDF.Settings.Template.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      completa: "T20PDF.Settings.Template.ChoiceCompleta",
      impressao: "T20PDF.Settings.Template.ChoiceImpressao",
    },
    default: DEFAULT_TEMPLATE,
  });
}

export function getTemplateSetting(): PDFTemplate {
  try {
    // @ts-expect-error fvtt-types narrows settings to known module ids; ours isn't registered
    const v = game.settings.get(MODULE_ID, SETTING_TEMPLATE) as string;
    return v === "impressao" ? "impressao" : "completa";
  } catch {
    return DEFAULT_TEMPLATE;
  }
}
