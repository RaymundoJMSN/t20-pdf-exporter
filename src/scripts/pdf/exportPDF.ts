// ────────────────────────────────────────────────────────────────────
// PDF builder for Tormenta 20 character sheets.
//
// Reads a Foundry Actor (`actor.system` + `actor.items`) and fills a
// pre-built AcroForm template (`assets/templates/sheet.pdf` or
// `sheet-print.pdf`). Template field names + filling pipeline derived
// from the standalone T20-DB exporter (see CLAUDE.md → Credits).
// ────────────────────────────────────────────────────────────────────

import {
  PDFDocument,
  type PDFFont,
  type PDFForm,
  PDFName,
  StandardFonts,
} from "pdf-lib";
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
  // Strip Foundry enrichment markers FIRST, before HTML stripping eats braces.
  // Patterns supported (most-specific first):
  //   @UUID[...]{Label}        → Label
  //   @Compendium[...]{Label}  → Label
  //   @Embed[...]{Label}       → Label
  //   @Check[...]{Label}       → Label
  //   @Roll[1d6]{Label}        → Label
  //   @UUID[...]               → ""  (no label form, just drop)
  //   @Compendium[...]         → ""
  //   @Embed[...]              → ""
  //   @Check[...]              → ""
  //   @Roll[...]               → ""
  const enrichedStripped = String(text).replace(
    /@(?:UUID|Compendium|Embed|Check|Roll)\[[^\]]+\](?:\{([^}]+)\})?/g,
    (_match, label: string | undefined) => label ?? "",
  );

  // Then strip HTML tags (item.system.description.value is HTML).
  const stripped = enrichedStripped
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
// T20 lookup tables — abbreviated codes → display names (pt-BR)
// ────────────────────────────────────────────────────────────────────

const ATR_FULL: Record<Atr, string> = {
  for: "Força",
  des: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  sab: "Sabedoria",
  car: "Carisma",
};

const MAGIA_TIPO: Record<string, string> = {
  arc: "Arcana",
  div: "Divina",
  uni: "Universal",
};

const MAGIA_ESCOLA: Record<string, string> = {
  abj: "Abjuração",
  adv: "Adivinhação",
  con: "Convocação",
  div: "Divinação",
  enc: "Encantamento",
  evo: "Evocação",
  ilu: "Ilusão",
  nec: "Necromancia",
  tra: "Transmutação",
};

const MAGIA_EXECUCAO: Record<string, string> = {
  action: "Padrão",
  full: "Completa",
  free: "Livre",
  reaction: "Reação",
  movement: "Movimento",
  passive: "Passiva",
};

const MAGIA_ALCANCE: Record<string, string> = {
  self: "Pessoal",
  short: "Curto",
  medium: "Médio",
  long: "Longo",
  unlimited: "Ilimitado",
  touch: "Toque",
  none: "—",
};

const MAGIA_DURACAO_UNITS: Record<string, string> = {
  inst: "Instantânea",
  round: "rodadas",
  scene: "Cena",
  day: "dias",
  min: "minutos",
  hour: "horas",
  perm: "Permanente",
  sustain: "Sustentada",
};

const PROF_ARMADURA: Record<string, string> = {
  lev: "Leve",
  pes: "Pesada",
  esc: "Escudo",
};

const PROF_ARMA: Record<string, string> = {
  simples: "Simples",
  marcial: "Marcial",
  exotica: "Exótica",
  exotic: "Exótica",
};

function lookupOrTitle(map: Record<string, string>, key: string): string {
  if (!key) return "";
  return map[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

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
// Arma + armadura formatters
// ────────────────────────────────────────────────────────────────────

const ATAQUE_ALCANCE: Record<string, string> = {
  "": "—",
  curto: "Curto",
  medio: "Médio",
  longo: "Longo",
  curt: "Curto",
};

const DANO_TIPO: Record<string, string> = {
  impacto: "Impacto",
  corte: "Corte",
  perfuracao: "Perfuração",
  curapv: "Cura PV",
  curapm: "Cura PM",
  acido: "Ácido",
  eletricidade: "Eletricidade",
  fogo: "Fogo",
  frio: "Frio",
  essencia: "Essência",
  luz: "Luz",
  psiquico: "Psíquico",
  trevas: "Trevas",
};

// Replace `@for`/`@des`/etc in a damage formula part with the numeric mod.
function resolveAttrTokens(formula: string, sys: AnyRec): string {
  return formula.replace(/@(for|des|con|int|sab|car)/gi, (_m, atr: string) => {
    const v = atributoTotal(sys, atr.toLowerCase() as Atr);
    return v >= 0 ? `+${v}` : String(v);
  });
}

interface ArmaSummary {
  nome: string;
  ataque: string;
  dano: string;
  critico: string;
  alcance: string;
  tipo: string;
}

function periciaTreinada(sys: AnyRec, key: string): boolean {
  const node = (sys.pericias as AnyRec | undefined)?.[key] as AnyRec | undefined;
  return node?.treinado === true;
}

function formatArma(item: FoundryItemLike, sys: AnyRec, nivel: number): ArmaSummary {
  const isys = (item.system ?? {}) as AnyRec;
  const rolls = Array.isArray(isys.rolls) ? (isys.rolls as AnyRec[]) : [];

  // Ataque roll — parts[0]=dice, parts[1]=skill key (e.g. "luta"|"pontaria"), parts[2]=bonus.
  const atkRoll = rolls.find((r) => r.type === "ataque");
  let ataqueStr = "";
  if (atkRoll) {
    const parts = Array.isArray(atkRoll.parts) ? (atkRoll.parts as unknown[][]) : [];
    const skillKey = String(parts[1]?.[0] ?? "luta");
    const bonus = Number(parts[2]?.[0] ?? 0) || 0;
    // Skill atributo lookup via PERICIAS table (luta→for, pontaria→des).
    const skillAtr: Atr =
      skillKey === "pontaria"
        ? "des"
        : skillKey === "luta"
          ? "for"
          : (((sys.pericias as AnyRec | undefined)?.[skillKey] as AnyRec | undefined)
              ?.atributo as Atr) ?? "for";
    const atrMod = atributoTotal(sys, skillAtr);
    const treino = periciaTreinada(sys, skillKey) ? bonusTreinoT20(nivel) : 0;
    const total = meioNivel(nivel) + atrMod + treino + bonus;
    ataqueStr = total >= 0 ? `+${total}` : String(total);
  }

  // Dano roll(s) — multiple "dano" rolls possible (versatil). Use first.
  const danoRoll = rolls.find((r) => r.type === "dano");
  let danoStr = "";
  let tipoStr = "";
  if (danoRoll) {
    const parts = Array.isArray(danoRoll.parts) ? (danoRoll.parts as unknown[][]) : [];
    const danoBits: string[] = [];
    for (const p of parts) {
      const expr = String(p?.[0] ?? "").trim();
      const t = String(p?.[1] ?? "").trim();
      if (!expr) continue;
      const resolved = resolveAttrTokens(expr, sys);
      danoBits.push(resolved);
      if (t && !tipoStr) tipoStr = lookupOrTitle(DANO_TIPO, t);
    }
    danoStr = danoBits.join("").replace(/^\+/, ""); // strip leading +
  }

  // Critico: "20 / x2", "19 / x3", default "20/x2".
  const cm = pickNumber(isys, "criticoM") || 20;
  const cx = pickNumber(isys, "criticoX") || 2;
  const criticoStr = `${cm}/x${cx}`;

  // Alcance: raw value or "—" for melee.
  const alcanceRaw = pickString(isys, "alcance");
  const alcanceStr = alcanceRaw ? lookupOrTitle(ATAQUE_ALCANCE, alcanceRaw) : "—";

  return {
    nome: item.name ?? "Arma",
    ataque: ataqueStr,
    dano: danoStr,
    critico: criticoStr,
    alcance: alcanceStr,
    tipo: tipoStr || "—",
  };
}

interface ArmaduraSummary {
  nome: string;
  defesa: string;
  penalidade: string;
}

// equipamento.system.tipo values seen: "leve" / "pes" (pesada) → armor. "esc" / "escudo" → shield.
function isArmadura(isys: AnyRec): boolean {
  const tipo = pickString(isys, "tipo");
  return tipo === "leve" || tipo === "pes" || tipo === "pesada" || tipo === "esc" || tipo === "escudo";
}

function formatArmadura(item: FoundryItemLike): ArmaduraSummary {
  const isys = (item.system ?? {}) as AnyRec;
  const armaduraNode = isys.armadura as AnyRec | undefined;
  const defesaVal = pickNumber(armaduraNode, "value");
  const penVal = pickNumber(armaduraNode, "penalidade");
  return {
    nome: item.name ?? "Armadura",
    defesa: defesaVal > 0 ? `+${defesaVal}` : String(defesaVal),
    penalidade: penVal !== 0 ? String(penVal) : "0",
  };
}

// ────────────────────────────────────────────────────────────────────
// Template-based overflow pages for poderes (Historico) and magias
// (Atualização). When the main sheet's field overflows, we copy the
// dedicated single-page overflow template (sheet_poderes.pdf /
// sheet_magias.pdf, or the print variants) and draw plain text inside
// the same field rectangle. Form-field annotations on the copy are
// stripped so the duplicate field names don't bind to the main page.
// ────────────────────────────────────────────────────────────────────

// Field rect on every variant (extracted via pypdf — same coords on all
// 6 templates). Coordinates are PDF userspace: (x1, y1) bottom-left,
// (x2, y2) top-right.
const OVERFLOW_RECT = { x: 35.5, y: 43.3, x2: 536.8, y2: 717.0 };
const OVERFLOW_PADDING = 6;
const OVERFLOW_FONT_SIZE = 9;
const OVERFLOW_LINE_HEIGHT = 11;
// Char count above which the main sheet field starts clipping even at 8pt;
// content past this cut goes to dedicated overflow pages.
const MAIN_FIELD_CAP = 3000;

async function fetchTemplateOptional(file: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`modules/${MODULE_ID}/assets/templates/${file}`);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Split `text` at the last newline before `cap`. If no good line break is
 *  found in the first half, falls back to a hard char cut. */
function splitAtLineBoundary(text: string, cap: number): [string, string] {
  if (text.length <= cap) return [text, ""];
  let cut = text.lastIndexOf("\n", cap);
  if (cut < cap * 0.5) cut = cap;
  return [text.slice(0, cut), text.slice(cut).replace(/^\n/, "")];
}

/** Copy an overflow-template page into `pdfDoc`, strip its form-field
 *  annotations (to avoid colliding with main-sheet fields of the same
 *  name), insert at `insertAtIdx`, and draw `chunkLines` inside the
 *  field rectangle.  Returns the inserted page. */
async function insertOverflowTemplatePage(
  pdfDoc: PDFDocument,
  srcBytes: ArrayBuffer,
  insertAtIdx: number,
  chunkLines: string[],
  font: PDFFont,
): Promise<void> {
  const src = await PDFDocument.load(srcBytes);
  const [copied] = await pdfDoc.copyPages(src, [0]);
  // Drop all annotations on the copy — that removes the duplicate form
  // fields so setText("Historico") on the form doesn't also overwrite
  // these pages.
  copied.node.delete(PDFName.of("Annots"));
  pdfDoc.insertPage(insertAtIdx, copied);

  let y = OVERFLOW_RECT.y2 - OVERFLOW_PADDING - OVERFLOW_FONT_SIZE;
  for (const line of chunkLines) {
    if (line) {
      copied.drawText(line, {
        x: OVERFLOW_RECT.x + OVERFLOW_PADDING,
        y,
        font,
        size: OVERFLOW_FONT_SIZE,
      });
    }
    y -= OVERFLOW_LINE_HEIGHT;
  }
}

/** Paginate `text` into one or more copies of the given overflow template,
 *  inserted starting at `insertAtIdx`.  Each insertion bumps subsequent
 *  page indices by 1, so callers should track the number returned and
 *  shift their next insert point accordingly.  Returns the count of
 *  pages added. */
async function appendOverflowTemplatePages(
  pdfDoc: PDFDocument,
  srcBytes: ArrayBuffer,
  text: string,
  insertAtIdx: number,
): Promise<number> {
  const sanText = sanitize(text);
  if (!sanText.trim()) return 0;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const maxWidth = OVERFLOW_RECT.x2 - OVERFLOW_RECT.x - OVERFLOW_PADDING * 2;
  const availableHeight = OVERFLOW_RECT.y2 - OVERFLOW_RECT.y - OVERFLOW_PADDING * 2;
  const linesPerPage = Math.floor(availableHeight / OVERFLOW_LINE_HEIGHT);

  // Pre-wrap every source line to the field width.
  const allLines: string[] = [];
  for (const raw of sanText.split("\n")) {
    if (raw === "") {
      allLines.push("");
      continue;
    }
    allLines.push(...wrapLine(raw, font, OVERFLOW_FONT_SIZE, maxWidth));
  }

  // Split into pages.
  const chunks: string[][] = [];
  for (let i = 0; i < allLines.length; i += linesPerPage) {
    chunks.push(allLines.slice(i, i + linesPerPage));
  }

  for (let i = 0; i < chunks.length; i++) {
    await insertOverflowTemplatePage(pdfDoc, srcBytes, insertAtIdx + i, chunks[i], font);
  }
  return chunks.length;
}

// ────────────────────────────────────────────────────────────────────
// Annex page renderer — fallback when no dedicated overflow template
// exists (currently: inventário, armas extras). Draws plain text on a
// new A4 page using the standard Helvetica font (CP1252 only;
// sanitize already filters).
// ────────────────────────────────────────────────────────────────────

const ANNEX_PAGE_WIDTH = 595; // A4 @ 72dpi
const ANNEX_PAGE_HEIGHT = 842;
const ANNEX_MARGIN = 40;
const ANNEX_FONT_SIZE = 9;
const ANNEX_TITLE_SIZE = 14;
const ANNEX_LINE_HEIGHT = 12;

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(/(\s+)/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur + w;
    const width = font.widthOfTextAtSize(trial, size);
    if (width > maxWidth && cur) {
      out.push(cur);
      cur = w.replace(/^\s+/, "");
    } else {
      cur = trial;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function appendAnnexPages(pdfDoc: PDFDocument, title: string, body: string): Promise<void> {
  const text = sanitize(body);
  if (!text.trim()) return;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = ANNEX_PAGE_WIDTH - ANNEX_MARGIN * 2;

  // Pre-wrap every source line so pagination is just "fits in remaining height?".
  const wrappedLines: { text: string; bold?: boolean }[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine === "") {
      wrappedLines.push({ text: "" });
      continue;
    }
    for (const w of wrapLine(rawLine, font, ANNEX_FONT_SIZE, maxWidth)) {
      wrappedLines.push({ text: w });
    }
  }

  let page = pdfDoc.addPage([ANNEX_PAGE_WIDTH, ANNEX_PAGE_HEIGHT]);
  let y = ANNEX_PAGE_HEIGHT - ANNEX_MARGIN;
  page.drawText(title, { x: ANNEX_MARGIN, y: y - ANNEX_TITLE_SIZE, font: fontBold, size: ANNEX_TITLE_SIZE });
  y -= ANNEX_TITLE_SIZE + 10;

  for (const line of wrappedLines) {
    if (y - ANNEX_LINE_HEIGHT < ANNEX_MARGIN) {
      page = pdfDoc.addPage([ANNEX_PAGE_WIDTH, ANNEX_PAGE_HEIGHT]);
      y = ANNEX_PAGE_HEIGHT - ANNEX_MARGIN;
      page.drawText(`${title} (cont.)`, {
        x: ANNEX_MARGIN,
        y: y - ANNEX_TITLE_SIZE,
        font: fontBold,
        size: ANNEX_TITLE_SIZE,
      });
      y -= ANNEX_TITLE_SIZE + 10;
    }
    if (line.text) {
      page.drawText(line.text, { x: ANNEX_MARGIN, y, font, size: ANNEX_FONT_SIZE });
    }
    y -= ANNEX_LINE_HEIGHT;
  }
}


// ────────────────────────────────────────────────────────────────────
// Magia formatter — header (tipo/círculo/escola/exec/alcance/alvo/duração/resistência),
// description, then aprimoramentos derived from effects[].flags.tormenta20.custo.
// ────────────────────────────────────────────────────────────────────

interface MagiaEffectLike {
  name?: string;
  flags?: { tormenta20?: { custo?: string | number } };
}

interface FoundryItemLike {
  name?: string | null;
  system?: unknown;
  // Foundry stores effects as an EmbeddedCollection; both arrays and collections
  // accept `[Symbol.iterator]`. We accept either and normalize via Array.from.
  effects?: Iterable<MagiaEffectLike> | null;
}

function formatDuracao(node: AnyRec | undefined): string {
  if (!node) return "";
  const units = typeof node.units === "string" ? node.units : "";
  const value = typeof node.value === "number" ? node.value : 0;
  const special = typeof node.special === "string" ? node.special.trim() : "";
  const unitLabel = lookupOrTitle(MAGIA_DURACAO_UNITS, units);
  if (!units) return special;
  if (units === "inst" || units === "perm" || units === "sustain") return unitLabel;
  // counted units: "scene" usually shows alone, others combine with value.
  if (units === "scene") return value > 1 ? `${value} ${unitLabel.toLowerCase()}s` : unitLabel;
  return value > 0 ? `${value} ${unitLabel}` : unitLabel;
}

function formatResistencia(node: AnyRec | undefined, sys: AnyRec, nivel: number): string {
  if (!node) return "";
  const txt = typeof node.txt === "string" ? node.txt.trim() : "";
  const atributo = typeof node.atributo === "string" ? node.atributo : "";
  if (!txt && !atributo) return "";

  // CD = 10 + meio nível + mod do atributo de conjuração do personagem.
  const conjAtr = pickString(sys, "attributes", "conjuracao") as Atr | "";
  let cdStr = "";
  if (conjAtr && (["for", "des", "con", "int", "sab", "car"] as string[]).includes(conjAtr)) {
    const mod = atributoTotal(sys, conjAtr as Atr);
    const cd = 10 + meioNivel(nivel) + mod;
    cdStr = ` (CD ${cd})`;
  }
  if (txt) return `${txt}${cdStr}`;
  // No txt — show attribute name + CD.
  const atrLabel = atributo in ATR_FULL ? ATR_FULL[atributo as Atr] : atributo;
  return `${atrLabel}${cdStr}`;
}

function formatMagia(item: FoundryItemLike, sys: AnyRec, nivel: number): string {
  const isys = (item.system ?? {}) as AnyRec;
  const name = item.name ?? "Magia";
  const tipo = lookupOrTitle(MAGIA_TIPO, pickString(isys, "tipo"));
  const circulo = pickNumber(isys, "circulo");
  const escola = lookupOrTitle(MAGIA_ESCOLA, pickString(isys, "escola"));
  const custoBase = pickNumber(isys, "ativacao", "custo");

  // Header line: • Nome (Arcana 1º, Encantamento, 1 PM)
  const headParts: string[] = [];
  if (tipo) headParts.push(`${tipo}${circulo ? ` ${circulo}º` : ""}`);
  else if (circulo) headParts.push(`${circulo}º`);
  if (escola) headParts.push(escola);
  if (custoBase > 0) headParts.push(`${custoBase} PM`);
  const header = `• ${name}${headParts.length > 0 ? ` (${headParts.join(", ")})` : ""}`;

  // Detail line(s): Execução | Alcance | Alvo/Área | Duração | Resistência
  const detailBits: string[] = [];
  const execucao = lookupOrTitle(MAGIA_EXECUCAO, pickString(isys, "ativacao", "execucao"));
  if (execucao) detailBits.push(`Execução: ${execucao}`);
  const alcance = lookupOrTitle(MAGIA_ALCANCE, pickString(isys, "alcance"));
  if (alcance && alcance !== "—") detailBits.push(`Alcance: ${alcance}`);
  const alvo = pickString(isys, "alvo").trim();
  const area = pickString(isys, "area").trim();
  if (alvo) detailBits.push(`Alvo: ${alvo}`);
  if (area) detailBits.push(`Área: ${area}`);
  const duracao = formatDuracao(isys.duracao as AnyRec | undefined);
  if (duracao) detailBits.push(`Duração: ${duracao}`);
  const resistencia = formatResistencia(isys.resistencia as AnyRec | undefined, sys, nivel);
  if (resistencia) detailBits.push(`Resistência: ${resistencia}`);

  const lines: string[] = [header];
  if (detailBits.length > 0) lines.push(detailBits.join(" | "));

  // Description (sanitize already strips Foundry @UUID[...]{label})
  const desc = sanitize(pickString(isys, "description", "value"));
  if (desc) lines.push(desc);

  // Aprimoramentos: each effect with flags.tormenta20.custo set is one upgrade.
  const allEffects: MagiaEffectLike[] = item.effects ? Array.from(item.effects) : [];
  const aprimoramentos = allEffects
    .filter((e) => {
      const c = e.flags?.tormenta20?.custo;
      return c !== undefined && c !== null && String(c).trim() !== "";
    })
    .map((e) => {
      const custo = e.flags?.tormenta20?.custo;
      const aprimText = sanitize(e.name ?? "");
      return `  ${custo} PM: ${aprimText}`;
    });
  if (aprimoramentos.length > 0) {
    lines.push("Aprimoramentos:");
    lines.push(...aprimoramentos);
  }

  return lines.join("\n");
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

  // 6) Carga — trust the runtime-computed actor.system.attributes.carga.{value,limit,max}
  // (Foundry T20 already accounts for size, items, modifiers). Fallback to
  // 5 + Força (medium-size formula) only if all three values are zero.
  const cargaNode = (sys.attributes as AnyRec | undefined)?.carga as AnyRec | undefined;
  const cargaValue = pickNumber(cargaNode, "value");
  const cargaLimit = pickNumber(cargaNode, "limit");
  const cargaMax = pickNumber(cargaNode, "max");
  if (cargaValue || cargaLimit || cargaMax) {
    setText(form, "cargaAtual", String(cargaValue));
    setText(form, "cargaMaxima", String(cargaLimit || cargaMax));
    setText(form, "levantar", String(cargaMax * 2 || cargaLimit * 4));
  } else {
    const forVal = atributoTotal(sys, "for");
    const fallbackMax = 5 + Math.max(0, forVal);
    // Sum espaços across all gear (equipamento + arma + consumivel + tesouro).
    const gear = items.filter((i) => {
      const t = i.type as string;
      return t === "equipamento" || t === "arma" || t === "consumivel" || t === "tesouro";
    });
    const fallbackAtual = gear.reduce((sum, i) => {
      const isys = (i.system ?? {}) as AnyRec;
      const qtd = typeof isys.qtd === "number" ? isys.qtd : 1;
      const esp = typeof isys.espacos === "number" ? isys.espacos : 0;
      return sum + esp * qtd;
    }, 0);
    setText(form, "cargaAtual", String(fallbackAtual));
    setText(form, "cargaMaxima", String(fallbackMax));
    setText(form, "levantar", String(fallbackMax * 2));
  }

  // 6b) Inventário categorizado (Equipamentos / Consumíveis / Tesouros).
  // Armas e armaduras saem dessa lista — vão pros slots dedicados abaixo.
  const armas = items.filter((i) => (i.type as string) === "arma");
  const armaduras = items.filter(
    (i) => (i.type as string) === "equipamento" && isArmadura((i.system ?? {}) as AnyRec),
  );
  const armaduraIds = new Set(armaduras.map((i) => (i as { id?: string }).id ?? i.name));
  const equipsGerais = items.filter(
    (i) => (i.type as string) === "equipamento" && !armaduraIds.has((i as { id?: string }).id ?? i.name),
  );
  const consumiveis = items.filter((i) => (i.type as string) === "consumivel");
  const tesouros = items.filter((i) => (i.type as string) === "tesouro");

  const formatItem = (i: typeof items[number]): string => {
    const isys = (i.system ?? {}) as AnyRec;
    const qtd = typeof isys.qtd === "number" ? isys.qtd : 1;
    const esp = typeof isys.espacos === "number" ? isys.espacos : 0;
    const qtdStr = qtd > 1 ? `${qtd}x ` : "";
    const espStr = esp > 0 ? ` (${(esp * qtd).toFixed(1).replace(/\.0$/, "")} esp)` : "";
    return `${qtdStr}${i.name}${espStr}`;
  };

  const invSections: string[] = [];
  if (equipsGerais.length > 0)
    invSections.push("Equipamentos:\n" + equipsGerais.map(formatItem).join("\n"));
  if (consumiveis.length > 0)
    invSections.push("Consumíveis:\n" + consumiveis.map(formatItem).join("\n"));
  if (tesouros.length > 0)
    invSections.push("Tesouros e Itens:\n" + tesouros.map(formatItem).join("\n"));
  const invSan = sanitize(invSections.join("\n\n"));
  // Split by LINE (not by char) so items don't get cut mid-word. Fills item1
  // up to ~24 lines / 950 chars, then item2 with the same caps, then the rest
  // spills to an annex page. Each subsequent box accepts whatever full line
  // didn't fit in the previous one.
  const ITEM_BOX_LINE_CAP = 24;
  const ITEM_BOX_CHAR_CAP = 950;
  const invLinesAll = invSan.split("\n");
  const boxes: string[][] = [[], []];
  const overflow: string[] = [];
  let curBox = 0;
  let curChars = 0;
  for (const line of invLinesAll) {
    if (curBox > 1) {
      overflow.push(line);
      continue;
    }
    const lineLen = line.length + 1; // +1 for the joining "\n"
    const wouldFitChars = curChars + lineLen <= ITEM_BOX_CHAR_CAP;
    const wouldFitLines = boxes[curBox].length < ITEM_BOX_LINE_CAP;
    if (boxes[curBox].length > 0 && (!wouldFitChars || !wouldFitLines)) {
      curBox += 1;
      curChars = 0;
      if (curBox > 1) {
        overflow.push(line);
        continue;
      }
    }
    boxes[curBox].push(line);
    curChars += lineLen;
  }
  setText(form, "item1", boxes[0].join("\n"));
  setText(form, "item2", boxes[1].join("\n"));
  // Overflow → annex page (preserves the section headings since they are
  // already part of the line stream).
  let invOverflowText = "";
  if (overflow.length > 0) {
    invOverflowText =
      "Continuação do inventário:\n\n" + overflow.join("\n");
  }

  // 6c) Armas → ataque1..5 / dano1..5 / critico1..5 / alcance1..5 / tipo1..5 / tAtak1..5
  const armaSummaries = armas.slice(0, 5).map((i) => formatArma(i as unknown as FoundryItemLike, sys, nivel));
  armaSummaries.forEach((s, idx) => {
    const n = idx + 1;
    setText(form, `tAtak${n}`, sanitize(s.nome));
    setText(form, `ataque${n}`, s.ataque);
    setText(form, `dano${n}`, sanitize(s.dano));
    setText(form, `critico${n}`, s.critico);
    setText(form, `alcance${n}`, sanitize(s.alcance));
    setText(form, `tipo${n}`, sanitize(s.tipo));
  });
  // Overflow weapons → annex.
  let armasOverflowText = "";
  if (armas.length > 5) {
    const extras = armas.slice(5).map((i, idx) => {
      const s = formatArma(i as unknown as FoundryItemLike, sys, nivel);
      return `${idx + 6}. ${s.nome}\n   Ataque: ${s.ataque} | Dano: ${s.dano} ${s.tipo ? `(${s.tipo})` : ""} | Crítico: ${s.critico} | Alcance: ${s.alcance}`;
    });
    armasOverflowText = "Armas extras (não couberam nos 5 slots):\n\n" + extras.join("\n\n");
  }

  // 6d) Armaduras → armadura1..2 / defesa1..2 / penalidade1..2
  const armaduraSummaries = armaduras.slice(0, 2).map((i) => formatArmadura(i as unknown as FoundryItemLike));
  armaduraSummaries.forEach((s, idx) => {
    const n = idx + 1;
    setText(form, `armadura${n}`, sanitize(s.nome));
    setText(form, `defesa${n}`, s.defesa);
    setText(form, `penalidade${n}`, s.penalidade);
  });

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

  // 8) Magias (item.type === "magia") — split at line boundary so first
  //    chunk fits the Atualização field; rest goes to dedicated overflow pages.
  const magias = items.filter((i) => (i.type as string) === "magia");
  const magiasTextFull = magias
    .map((i) => formatMagia(i as unknown as FoundryItemLike, sys, nivel))
    .join("\n\n");
  const [magMain, magOverflow] = splitAtLineBoundary(magiasTextFull, MAIN_FIELD_CAP);
  setText(form, "Atualização", sanitize(magMain));
  autoFontSize(form, "Atualização", magMain.length);

  // 9) Poderes (item.type === "poder") — same split.
  const poderes = items.filter((i) => (i.type as string) === "poder");
  const poderesTextFull = poderes
    .map((i) => {
      const isys = (i.system ?? {}) as AnyRec;
      const subtipo = pickString(isys, "subtipo");
      const desc = sanitize(pickString(isys, "description", "value"));
      const head = subtipo ? `• ${i.name} (${subtipo})` : `• ${i.name}`;
      return desc ? `${head}: ${desc}` : head;
    })
    .join("\n\n");
  const [podMain, podOverflow] = splitAtLineBoundary(poderesTextFull, MAIN_FIELD_CAP);
  setText(form, "Historico", sanitize(podMain));
  autoFontSize(form, "Historico", podMain.length);

  // 10) Proficiências (armaduras + armas → nomes legíveis)
  const profArmaduras = (sys.tracos as AnyRec | undefined)?.profArmaduras as AnyRec | undefined;
  const profArmas = (sys.tracos as AnyRec | undefined)?.profArmas as AnyRec | undefined;
  const armList = Array.isArray(profArmaduras?.value) ? (profArmaduras!.value as string[]) : [];
  const armaList = Array.isArray(profArmas?.value) ? (profArmas!.value as string[]) : [];
  const armNames = armList.map((s) => lookupOrTitle(PROF_ARMADURA, s));
  const armaNames = armaList.map((s) => lookupOrTitle(PROF_ARMA, s));
  const profsLines: string[] = [];
  if (armNames.length > 0) profsLines.push(`Armaduras: ${armNames.join(", ")}`);
  if (armaNames.length > 0) profsLines.push(`Armas: ${armaNames.join(", ")}`);
  setText(form, "caracteristicas", sanitize(profsLines.join("\n")));

  // 11) Overflow pages for poderes/magias use dedicated single-page
  // templates (sheet_poderes.pdf / sheet_magias.pdf, or the print variants),
  // inserted right after the corresponding main-sheet page. Main sheet has
  // 3 pages: 0=header, 1=poderes (Historico), 2=magias (Atualização).
  // Order: poderes overflow FIRST (so we know how many pages it added before
  // computing where magias sits), then magias overflow appended after that.
  const podTplFile = template === "impressao" ? "sheet-print_poderes.pdf" : "sheet_poderes.pdf";
  const magTplFile = template === "impressao" ? "sheet-print_magias.pdf" : "sheet_magias.pdf";

  const PODERES_PAGE_IDX = 1;
  const MAGIAS_PAGE_IDX = 2;

  let podPagesAdded = 0;
  if (podOverflow.trim()) {
    const podBytes = await fetchTemplateOptional(podTplFile);
    if (podBytes) {
      podPagesAdded = await appendOverflowTemplatePages(
        pdfDoc,
        podBytes,
        podOverflow,
        PODERES_PAGE_IDX + 1,
      );
    } else {
      // Fallback: plain annex page (template missing).
      await appendAnnexPages(pdfDoc, "Poderes (continuação)", podOverflow);
    }
  }

  if (magOverflow.trim()) {
    const magBytes = await fetchTemplateOptional(magTplFile);
    if (magBytes) {
      const insertAt = MAGIAS_PAGE_IDX + podPagesAdded + 1;
      await appendOverflowTemplatePages(pdfDoc, magBytes, magOverflow, insertAt);
    } else {
      await appendAnnexPages(pdfDoc, "Magias (continuação)", magOverflow);
    }
  }

  // Inventário + armas extras still use plain annex pages (no dedicated template).
  if (invOverflowText) {
    await appendAnnexPages(pdfDoc, "Inventário (continuação)", invOverflowText);
  }
  if (armasOverflowText) {
    await appendAnnexPages(pdfDoc, "Armas adicionais", armasOverflowText);
  }

  // 12) Metadata + open
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
