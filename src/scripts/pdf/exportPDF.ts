// ────────────────────────────────────────────────────────────────────
// PDF builder for Tormenta 20 character sheets.
//
// Reads a Foundry Actor (`actor.system` + `actor.items`) and fills a
// pre-built AcroForm template (`assets/templates/sheet.pdf` or
// `sheet-print.pdf`). Template field names + filling pipeline derived
// from the standalone T20-DB exporter (see CLAUDE.md → Credits).
// ────────────────────────────────────────────────────────────────────

import { PDFDocument, type PDFForm } from "pdf-lib";
import { MODULE_ID } from "../../constants";

export type PDFTemplate = "completa" | "impressao";

// ────────────────────────────────────────────────────────────────────
// Text helpers (CP1252 sanitize + formatting)
// ────────────────────────────────────────────────────────────────────

const CP1252_REPLACEMENTS: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  "•": "*",
  " ": " ",
};

function sanitize(text: string | null | undefined): string {
  if (!text) return "";
  // Strip HTML tags first (item.system.description.value is HTML).
  const stripped = String(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  let out = stripped;
  for (const [from, to] of Object.entries(CP1252_REPLACEMENTS)) {
    out = out.split(from).join(to);
  }
  return Array.from(out)
    .filter((c) => (c.codePointAt(0) ?? 0) <= 0xff)
    .join("");
}

function formatMod(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}

function meioNivel(nivel: number): number {
  return Math.floor(nivel / 2);
}

function bonusTreinoT20(nivel: number): number {
  if (nivel <= 6) return 2;
  if (nivel <= 14) return 4;
  return 6;
}

// ────────────────────────────────────────────────────────────────────
// T20 schema constants
// ────────────────────────────────────────────────────────────────────

type Atr = "for" | "des" | "con" | "int" | "sab" | "car";

const ATR_FIELD: Record<Atr, string> = {
  for: "modFor",
  des: "modDes",
  con: "modCon",
  int: "modInt",
  sab: "modSab",
  car: "modCar",
};

// 29 perícias in alphabetical order (Portuguese). Index = template position.
// Each entry maps the alphabetical-Portuguese name to its T20 system key
// (`actor.system.pericias[KEY]`) and its key attribute.
type PericiaRow = {
  label: string; // alfabético em português (para referência)
  key: string | string[]; // chave em actor.system.pericias — array = composto (oficio)
  atr: Atr;
};

const PERICIAS: PericiaRow[] = [
  { label: "acrobacia", key: "acro", atr: "des" },
  { label: "adestramento", key: "ades", atr: "car" },
  { label: "atletismo", key: "atle", atr: "for" },
  { label: "atuacao", key: "atua", atr: "car" },
  { label: "cavalgar", key: "cava", atr: "des" },
  { label: "conhecimento", key: "conh", atr: "int" },
  { label: "cura", key: "cura", atr: "sab" },
  { label: "diplomacia", key: "dipl", atr: "car" },
  { label: "enganacao", key: "enga", atr: "car" },
  { label: "fortitude", key: "fort", atr: "con" },
  { label: "furtividade", key: "furt", atr: "des" },
  { label: "guerra", key: "guer", atr: "int" },
  { label: "iniciativa", key: "inic", atr: "des" },
  { label: "intimidacao", key: "inti", atr: "car" },
  { label: "intuicao", key: "intu", atr: "sab" },
  { label: "investigacao", key: "inve", atr: "int" },
  { label: "jogatina", key: "joga", atr: "car" },
  { label: "ladinagem", key: "ladi", atr: "des" },
  { label: "luta", key: "luta", atr: "for" },
  { label: "misticismo", key: "mist", atr: "int" },
  { label: "nobreza", key: "nobr", atr: "int" },
  // ofício = união de 6 sub-skills (alfabetização, alquimia, armeiro, artesão, cozinha, engenharia).
  // Para o MVP, marca treinado se QUALQUER sub for treinada, e usa o maior `.value`.
  { label: "oficio", key: ["alfa", "alqu", "arme", "arte", "cozi", "enge"], atr: "int" },
  { label: "percepcao", key: "perc", atr: "sab" },
  { label: "pilotagem", key: "pilo", atr: "des" },
  { label: "pontaria", key: "pont", atr: "des" },
  { label: "reflexos", key: "refl", atr: "des" },
  { label: "religiao", key: "reli", atr: "sab" },
  { label: "sobrevivencia", key: "sobr", atr: "sab" },
  { label: "vontade", key: "vont", atr: "sab" },
];

// ────────────────────────────────────────────────────────────────────
// Foundry actor reads (kept loose — T20 schema isn't in fvtt-types)
// ────────────────────────────────────────────────────────────────────

type AnyRec = Record<string, unknown>;

function pickNumber(obj: unknown, ...path: string[]): number {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object") cur = (cur as AnyRec)[k];
    else return 0;
  }
  return typeof cur === "number" ? cur : 0;
}

function pickString(obj: unknown, ...path: string[]): string {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object") cur = (cur as AnyRec)[k];
    else return "";
  }
  return typeof cur === "string" ? cur : "";
}

function atributoTotal(sys: AnyRec, atr: Atr): number {
  const node = (sys.atributos as AnyRec | undefined)?.[atr] as AnyRec | undefined;
  if (!node) return 0;
  const value = typeof node.value === "number" ? node.value : 0;
  if (value !== 0) return value;
  const base = typeof node.base === "number" ? node.base : 0;
  const racial = typeof node.racial === "number" ? node.racial : 0;
  const bonus = typeof node.bonus === "number" ? node.bonus : 0;
  return base + racial + bonus;
}

function periciaValue(sys: AnyRec, row: PericiaRow): { total: number; treinada: boolean } {
  const all = sys.pericias as AnyRec | undefined;
  if (!all) return { total: 0, treinada: false };
  const keys = Array.isArray(row.key) ? row.key : [row.key];
  let bestTotal = 0;
  let treinada = false;
  for (const k of keys) {
    const node = all[k] as AnyRec | undefined;
    if (!node) continue;
    const v = typeof node.value === "number" ? node.value : 0;
    if (v > bestTotal) bestTotal = v;
    if (node.treinado === true) treinada = true;
  }
  return { total: bestTotal, treinada };
}

// ────────────────────────────────────────────────────────────────────
// PDFForm helpers (silently ignore missing fields)
// ────────────────────────────────────────────────────────────────────

function setText(form: PDFForm, name: string, value: string): void {
  try {
    form.getTextField(name).setText(value);
  } catch {
    /* missing field — ignore */
  }
}

function setCheckBox(form: PDFForm, name: string, checked: boolean): void {
  try {
    const box = form.getCheckBox(name);
    if (checked) box.check();
    else box.uncheck();
  } catch {
    /* ignore */
  }
}

function setDropdown(form: PDFForm, name: string, option: string): void {
  try {
    form.getDropdown(name).select(option);
  } catch {
    /* ignore */
  }
}

function autoFontSize(form: PDFForm, name: string, len: number): void {
  try {
    const f = form.getTextField(name);
    if (len > 9000) f.setFontSize(8);
    else if (len > 6000) f.setFontSize(9);
    else if (len > 4000) f.setFontSize(10);
    else if (len > 2500) f.setFontSize(11);
    else f.setFontSize(12);
  } catch {
    /* ignore */
  }
}

// ────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────

export interface ExportOptions {
  /** Default `"completa"`. `"impressao"` uses the no-background template. */
  template?: PDFTemplate;
}

export async function buildAndOpenPDF(
  actor: Actor,
  options: ExportOptions = {},
): Promise<void> {
  const template: PDFTemplate = options.template ?? "completa";

  // 1) Load template via relative URL (Foundry serves module dir).
  const file = template === "impressao" ? "sheet-print.pdf" : "sheet.pdf";
  let res = await fetch(`modules/${MODULE_ID}/assets/templates/${file}`);
  if (!res.ok && template === "impressao") {
    res = await fetch(`modules/${MODULE_ID}/assets/templates/sheet.pdf`);
  }
  if (!res.ok) throw new Error(`Template not found: ${file} (HTTP ${res.status})`);

  const bytes = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  const sys = (actor.system ?? {}) as AnyRec;
  const items = actor.items?.contents ?? [];
  const nivel = pickNumber(sys, "attributes", "nivel", "value") || 1;

  // 2) Header (Nome / Raça / Classe / Origem / Divindade)
  setText(form, "Nome", sanitize(actor.name));

  const raceItem = items.find((i) => (i.type as string) === "race");
  setText(form, "Raca", sanitize(raceItem?.name ?? pickString(sys, "detalhes", "raca")));

  const classItem = items.find((i) => (i.type as string) === "classe");
  setText(
    form,
    "Classe",
    sanitize(classItem ? `${classItem.name} ${nivel}` : ""),
  );

  setText(form, "Origem", sanitize(pickString(sys, "detalhes", "origem")));
  setText(form, "Divindade", sanitize(pickString(sys, "detalhes", "divindade")));

  // 3) Atributos
  (["for", "des", "con", "int", "sab", "car"] as Atr[]).forEach((a) => {
    setText(form, ATR_FIELD[a], formatMod(atributoTotal(sys, a)));
  });

  // 4) PV / PM / Defesa / metade do nível
  setText(form, "vidaMax", String(pickNumber(sys, "attributes", "pv", "value")));
  setText(form, "manaMax", String(pickNumber(sys, "attributes", "pm", "value")));
  setText(form, "Texto13", String(pickNumber(sys, "attributes", "defesa", "value") || 10));
  setText(form, "metadeDoNivel", String(meioNivel(nivel)));
  setDropdown(form, "modDef", "modDes");

  // 5) Deslocamento (terrestre + extras)
  const mv = (sys.attributes as AnyRec | undefined)?.movement as AnyRec | undefined;
  const walk = pickNumber(mv, "walk", "base") || 9;
  const extras: string[] = [];
  const addM = (path: string, label: string) => {
    const v = pickNumber(mv, path, "base");
    if (v > 0) extras.push(`${label} ${v}m`);
  };
  addM("fly", "Voo");
  addM("climb", "Esc");
  addM("burrow", "Exc");
  addM("swim", "Nat");
  const deslocText = extras.length > 0 ? `${walk} (${extras.join(", ")})` : String(walk);
  setText(form, "deslocamento", sanitize(deslocText));

  // 6) Inventário + carga
  const equips = items.filter((i) => (i.type as string) === "equipamento");
  const invLines = equips.map((i) => {
    const isys = (i.system ?? {}) as AnyRec;
    const qtd = typeof isys.qtd === "number" ? isys.qtd : 1;
    const esp = typeof isys.espacos === "number" ? isys.espacos : 0;
    const qtdStr = qtd > 1 ? `${qtd}x ` : "";
    const espStr = esp > 0 ? ` (${esp * qtd} espaços)` : "";
    return `${qtdStr}${i.name}${espStr}`;
  });
  const invSan = sanitize(invLines.join("\n"));
  setText(form, "item1", invSan.slice(0, 1000));
  setText(form, "item2", invSan.slice(1000, 2000));

  const cargaAtual = equips.reduce((sum, i) => {
    const isys = (i.system ?? {}) as AnyRec;
    const qtd = typeof isys.qtd === "number" ? isys.qtd : 1;
    const esp = typeof isys.espacos === "number" ? isys.espacos : 0;
    return sum + esp * qtd;
  }, 0);
  const forVal = atributoTotal(sys, "for");
  const maxSpaces = 5 + Math.max(0, forVal);
  setText(form, "cargaAtual", String(cargaAtual));
  setText(form, "cargaMaxima", String(maxSpaces));
  setText(form, "levantar", String(maxSpaces * 2));

  // 7) Perícias (29 linhas; template has typo `tota23` at index 22)
  PERICIAS.forEach((row, idx) => {
    const { total, treinada } = periciaValue(sys, row);
    const training = treinada ? bonusTreinoT20(nivel) : 0;
    const totalField = idx === 22 ? `tota${idx + 1}` : `total${idx + 1}`;
    setText(form, totalField, String(total));
    setText(form, `treino${idx}`, String(training));
    setText(form, `outros${idx + 1}`, "0");
    setDropdown(form, `modSelect${idx}`, ATR_FIELD[row.atr]);
    setCheckBox(form, `treinado${idx + 1}`, treinada);
  });

  // 8) Magias (item.type === "magia")
  const magias = items.filter((i) => (i.type as string) === "magia");
  const magiasText = magias
    .map((i) => {
      const isys = (i.system ?? {}) as AnyRec;
      const desc = sanitize(pickString(isys, "description", "value"));
      const custo = pickNumber(isys, "custoPM");
      const head = `• ${i.name}${custo ? ` (${custo} PM)` : ""}`;
      return desc ? `${head}: ${desc}` : head;
    })
    .join("\n\n");
  setText(form, "Atualização", sanitize(magiasText));
  autoFontSize(form, "Atualização", magiasText.length);

  // 9) Poderes (item.type === "poder") + raça (race + class powers blob)
  const poderes = items.filter((i) => (i.type as string) === "poder");
  const poderesText = poderes
    .map((i) => {
      const isys = (i.system ?? {}) as AnyRec;
      const subtipo = pickString(isys, "subtipo");
      const desc = sanitize(pickString(isys, "description", "value"));
      const head = subtipo ? `• ${i.name} (${subtipo})` : `• ${i.name}`;
      return desc ? `${head}: ${desc}` : head;
    })
    .join("\n\n");
  setText(form, "Historico", sanitize(poderesText));
  autoFontSize(form, "Historico", poderesText.length);

  // 10) Proficiências (armaduras + armas)
  const profArmaduras = (sys.tracos as AnyRec | undefined)?.profArmaduras as AnyRec | undefined;
  const profArmas = (sys.tracos as AnyRec | undefined)?.profArmas as AnyRec | undefined;
  const armList = Array.isArray(profArmaduras?.value) ? (profArmaduras!.value as string[]) : [];
  const armaList = Array.isArray(profArmas?.value) ? (profArmas!.value as string[]) : [];
  const profsText = [
    ...armList.map((s) => `Armadura: ${s}`),
    ...armaList.map((s) => `Arma: ${s}`),
  ].join("\n");
  setText(form, "caracteristicas", sanitize(profsText));

  // 11) Metadata + open
  pdfDoc.setTitle(`Ficha de ${actor.name ?? "Personagem"}`);
  pdfDoc.setAuthor(MODULE_ID);
  const out = await pdfDoc.save();

  const blob = new Blob([out as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(actor.name ?? "ficha").replace(/\s+/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
