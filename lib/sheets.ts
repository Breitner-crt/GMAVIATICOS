import { cookies } from "next/headers";
import { getAccessToken, hasServiceAccount } from "./google";
import {
  demoAddItem,
  demoDeleteItem,
  demoRead,
  demoSaveTotals,
  demoUpdateItem,
  demoWriteHeader,
} from "./demo";
import {
  HEADER_CELLS,
  ITEM_CAPACITY,
  ITEM_COLUMNS,
  ITEM_FIRST_ROW,
  ITEM_LAST_ROW,
  TOTALS_CELLS,
  headerRange,
  isItemEmpty,
  itemCellValue,
  itemRange,
  looksLikeSerial,
  normalizeHeaderInput,
  normalizeItemInput,
  parseTotals,
  rowsToItems,
  serialToDate,
} from "./schema";
import type { HeaderData, Item, ItemFieldKey, SheetData } from "./types";

export type DataSource = "sheets" | "webhook" | "demo";

type CellValue = string | number;
type Update = { range: string; values: CellValue[][] };
type Config = { sheetId: string; tab: string };

/** Cookie con la hoja activa: permite cambiar de hoja sin redesplegar. */
export const SHEET_COOKIE = "lv_sheet";
export const DEFAULT_SHEET_ID = "1Ezz6wbEu4f3k8h-kpB8HWvcEP6ZYyATHwNddb0NxCvI";
const SHEET_ID_PATTERN = /^[a-zA-Z0-9_-]{20,120}$/;

/** Acepta el ID suelto o una URL completa de Google Sheets. */
export function parseSheetId(input: string): string {
  const value = input.trim();
  const fromUrl = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const candidate = (fromUrl ? fromUrl[1] : value).trim();
  if (!SHEET_ID_PATTERN.test(candidate)) {
    throw new Error(
      "El ID de la hoja no es válido. Copia el ID de la URL (entre /d/ y /edit) o pega la URL completa."
    );
  }
  return candidate;
}

export async function sheetConfig(override?: { sheetId?: string }): Promise<Config> {
  const tab = process.env.SHEET_TAB?.trim() || "FORMATO DE LIQUIDACION";

  if (override?.sheetId) {
    return { sheetId: parseSheetId(override.sheetId), tab };
  }

  let fromCookie = "";
  try {
    fromCookie = (await cookies()).get(SHEET_COOKIE)?.value?.trim() ?? "";
  } catch {
    /* fuera de una petición: se usa el valor por defecto */
  }

  const sheetId = SHEET_ID_PATTERN.test(fromCookie)
    ? fromCookie
    : process.env.SHEET_ID?.trim() || DEFAULT_SHEET_ID;

  return { sheetId, tab };
}

export function dataSource(): DataSource {
  if (process.env.DEMO_MODE === "1") return "demo";
  if (process.env.SHEETS_WEBHOOK_URL?.trim()) return "webhook";
  if (hasServiceAccount()) return "sheets";
  return "demo";
}

/* ------------------------------------------------------------------ */
/* Google Sheets API                                                   */
/* ------------------------------------------------------------------ */

function apiUrl(sheetId: string, path: string) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}${path}`;
}

function friendlyError(status: number, detail: string): string {
  if (detail.includes("not a Google Sheets file")) {
    return "El archivo es un Excel subido a Drive. Ábrelo en Google Sheets y usa Archivo → Guardar como Hojas de cálculo de Google, luego compártelo con la cuenta de servicio.";
  }
  if (status === 403) {
    return "La cuenta de servicio no tiene permiso. Comparte la hoja con su correo (client_email) como Editor.";
  }
  if (status === 404) {
    return "No se encontró la hoja. Revisa el ID y que esté compartida con la cuenta de servicio.";
  }
  return `Google Sheets respondió ${status}: ${detail.slice(0, 300)}`;
}

async function googleFetch(sheetId: string, path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = await fetch(apiUrl(sheetId, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(friendlyError(res.status, detail));
  }
  return res.json();
}

async function readRaw(config: Config) {
  const { tab } = config;
  const headerCells = Object.values(HEADER_CELLS);
  const ranges = [
    ...headerCells.map((cell) => headerRange(tab, cell)),
    headerRange(tab, `A${ITEM_FIRST_ROW}:AD${ITEM_LAST_ROW}`),
    headerRange(tab, `T70:T74`),
  ];

  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    majorDimension: "ROWS",
  });
  for (const range of ranges) params.append("ranges", range);

  const data = (await googleFetch(
    config.sheetId,
    `/values:batchGet?${params.toString()}`
  )) as {
    valueRanges?: { values?: unknown[][] }[];
  };

  const valueRanges = data.valueRanges ?? [];
  const headerValues = headerCells.map((_, index) => {
    const first = valueRanges[index]?.values?.[0];
    return first?.[0] ?? "";
  });

  const itemRows = valueRanges[headerCells.length]?.values ?? [];
  const padded: unknown[][] = [];
  for (let i = 0; i < ITEM_CAPACITY; i += 1) {
    padded.push(itemRows[i] ?? []);
  }

  const totalsValues = (valueRanges[headerCells.length + 1]?.values ?? []).map(
    (row) => row?.[0] ?? ""
  );

  return { headerValues, itemRows: padded, totalsValues };
}

async function batchUpdate(config: Config, updates: Update[]) {
  if (!updates.length) return;
  await googleFetch(config.sheetId, `/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: updates,
    }),
  });
}

/* ------------------------------------------------------------------ */
/* Webhook (Apps Script)                                               */
/* ------------------------------------------------------------------ */

type WebhookRead = {
  headerValues: unknown[];
  itemRows: unknown[][];
  totalsValues: unknown[];
};

async function webhookCall<T>(action: "read" | "write", payload?: unknown): Promise<T> {
  const url = process.env.SHEETS_WEBHOOK_URL?.trim();
  const token = process.env.SHEETS_WEBHOOK_TOKEN?.trim() ?? "";
  if (!url) throw new Error("Falta SHEETS_WEBHOOK_URL.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, action, payload }),
    cache: "no-store",
  });

  const text = await res.text();
  let data: { ok?: boolean; data?: T; error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `El webhook no devolvió JSON (${res.status}). Revisa que la implementación esté publicada con acceso "Cualquiera".`
    );
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `El webhook respondió ${res.status}.`);
  }
  return data.data as T;
}

async function readRawFromWebhook(): Promise<WebhookRead> {
  return webhookCall<WebhookRead>("read");
}

async function writeViaWebhook(updates: Update[]) {
  if (!updates.length) return;
  await webhookCall("write", { updates });
}

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

const DATE_HEADER_KEYS: (keyof HeaderData)[] = ["del", "al", "liquidado"];

function headerFromValues(values: unknown[]): HeaderData {
  const keys = Object.keys(HEADER_CELLS) as (keyof HeaderData)[];
  const raw: Partial<HeaderData> = {};
  keys.forEach((key, index) => {
    const value = values[index];
    if (value === null || value === undefined) {
      raw[key] = "";
      return;
    }
    if (DATE_HEADER_KEYS.includes(key) && looksLikeSerial(value)) {
      raw[key] = serialToDate(value as number);
      return;
    }
    if (DATE_HEADER_KEYS.includes(key)) {
      const text = String(value);
      if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
        raw[key] = text.slice(0, 10);
        return;
      }
    }
    raw[key] = String(value);
  });
  return normalizeHeaderInput(raw);
}

function buildSheetData(
  headerValues: unknown[],
  itemRows: unknown[][],
  totalsValues: unknown[],
  source: DataSource,
  config: Config
): SheetData {
  const { sheetId, tab } = config;
  return {
    header: headerFromValues(headerValues),
    items: rowsToItems(itemRows),
    totals: parseTotals(totalsValues),
    meta: {
      sheetId,
      tab,
      source,
      firstRow: ITEM_FIRST_ROW,
      lastRow: ITEM_LAST_ROW,
      capacity: ITEM_CAPACITY,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function readSheet(override?: { sheetId?: string }): Promise<SheetData> {
  const source = dataSource();
  const config = await sheetConfig(override);
  if (source === "demo") return demoRead();

  const raw = source === "webhook" ? await readRawFromWebhook() : await readRaw(config);
  return buildSheetData(raw.headerValues, raw.itemRows, raw.totalsValues, source, config);
}

export async function writeHeader(input: Partial<HeaderData>): Promise<SheetData> {
  const source = dataSource();
  const config = await sheetConfig();
  const header = normalizeHeaderInput(input);

  // El No. de liquidación se genera solo: año + consecutivo (2026-001).
  if (!header.numeroLiquidacion) {
    if (source === "sheets") header.numeroLiquidacion = await nextLiquidationNumber(config);
    else if (source === "demo") header.numeroLiquidacion = nextLiquidationNumberFrom([]);
  }

  if (source === "demo") return demoWriteHeader(header);

  const updates: Update[] = [];
  for (const key of Object.keys(HEADER_CELLS) as (keyof HeaderData)[]) {
    const cell = HEADER_CELLS[key];
    updates.push({
      range: headerRange(config.tab, cell),
      values: [[safeCell(header[key])]],
    });
  }

  if (source === "webhook") await writeViaWebhook(updates);
  else await batchUpdate(config, updates);

  return readSheet();
}

export async function addItem(input: Partial<Item>): Promise<SheetData> {
  const source = dataSource();
  const item = normalizeItemInput(input);
  const config = await sheetConfig();
  const current = await readSheet();

  const target = current.items.find((row) => isItemEmpty(row));
  if (!target) {
    throw new Error(
      `No hay filas libres: el formato admite ${ITEM_CAPACITY} gastos (filas ${ITEM_FIRST_ROW}-${ITEM_LAST_ROW}).`
    );
  }

  if (source === "demo") return demoAddItem(item);

  const updates = itemUpdates(config.tab, target.row, item);
  if (source === "webhook") await writeViaWebhook(updates);
  else await batchUpdate(config, updates);

  // La fila nueva pudo quedar en medio de un hueco: se renumera todo.
  await renumberItems(config, source);

  let data = await readSheet();
  // Reintento por si Google Sheets tarda un instante en reflejar la escritura.
  const saved = data.items.find((row) => row.row === target.row);
  if (!saved || isItemEmpty(saved)) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    data = await readSheet();
  }
  return data;
}

export async function updateItem(row: number, input: Partial<Item>): Promise<SheetData> {
  const source = dataSource();
  const item = normalizeItemInput(input);
  const config = await sheetConfig();

  if (row < ITEM_FIRST_ROW || row > ITEM_LAST_ROW) {
    throw new Error("Fila fuera de rango.");
  }

  if (source === "demo") return demoUpdateItem(row, item);

  const updates = itemUpdates(config.tab, row, item);
  if (source === "webhook") await writeViaWebhook(updates);
  else await batchUpdate(config, updates);

  return readSheet();
}

export async function deleteItem(row: number): Promise<SheetData> {
  const source = dataSource();
  const config = await sheetConfig();

  if (row < ITEM_FIRST_ROW || row > ITEM_LAST_ROW) {
    throw new Error("Fila fuera de rango.");
  }

  if (source === "demo") return demoDeleteItem(row);

  const updates: Update[] = [];
  for (const letter of Object.values(ITEM_COLUMNS)) {
    updates.push({ range: itemRange(config.tab, letter, row), values: [[""]] });
  }
  updates.push({ range: itemRange(config.tab, "A", row), values: [[""]] });

  if (source === "webhook") await writeViaWebhook(updates);
  else await batchUpdate(config, updates);

  // Renumera las filas restantes para que la columna "No." quede continua.
  await renumberItems(config, source);
  return readSheet();
}

export async function saveTotals(input: {
  acreditado?: number;
  corte?: number;
}): Promise<SheetData> {
  const source = dataSource();
  const config = await sheetConfig();

  if (source === "demo") return demoSaveTotals(input);

  const updates: Update[] = [];
  if (typeof input.acreditado === "number" && Number.isFinite(input.acreditado)) {
    updates.push({
      range: headerRange(config.tab, TOTALS_CELLS.acreditado),
      values: [[input.acreditado]],
    });
  }
  if (typeof input.corte === "number" && Number.isFinite(input.corte)) {
    updates.push({
      range: headerRange(config.tab, TOTALS_CELLS.corte),
      values: [[input.corte]],
    });
  }

  if (source === "webhook") await writeViaWebhook(updates);
  else await batchUpdate(config, updates);

  return readSheet();
}

/**
 * Deja el formato listo para una liquidación nueva.
 * - "items": limpia solo la tabla de gastos (filas 10–50).
 * - "all": limpia además el encabezado y el acreditado/corte.
 * Nunca toca las columnas con fórmulas (W, Y, Z, AA) ni los totales calculados.
 */
export async function resetSheet(scope: "items" | "all"): Promise<SheetData> {
  const source = dataSource();
  const config = await sheetConfig();

  if (source === "demo") {
    const data = demoRead();
    for (const item of data.items) {
      const blank = normalizeItemInput({ row: item.row });
      Object.assign(item, blank, { no: "", idp: "", neto: "", base: "", iva: "" });
    }
    if (scope === "all") {
      demoWriteHeader(normalizeHeaderInput({}));
      demoSaveTotals({ acreditado: 0, corte: 0 });
    }
    return demoRead();
  }

  const { tab } = config;
  const updates: Update[] = [];
  const rows = ITEM_LAST_ROW - ITEM_FIRST_ROW + 1;
  const blanks = Array.from({ length: rows }, () => ["" as CellValue]);

  for (const letter of Object.values(ITEM_COLUMNS)) {
    updates.push({
      range: headerRange(tab, `${letter}${ITEM_FIRST_ROW}:${letter}${ITEM_LAST_ROW}`),
      values: blanks.map((row) => [...row]),
    });
  }
  updates.push({
    range: headerRange(tab, `A${ITEM_FIRST_ROW}:A${ITEM_LAST_ROW}`),
    values: blanks.map((row) => [...row]),
  });

  if (scope === "all") {
    for (const cell of Object.values(HEADER_CELLS)) {
      updates.push({ range: headerRange(tab, cell), values: [[""]] });
    }
    updates.push({ range: headerRange(tab, TOTALS_CELLS.acreditado), values: [[""]] });
    updates.push({ range: headerRange(tab, TOTALS_CELLS.corte), values: [[""]] });
  }

  if (source === "webhook") await writeViaWebhook(updates);
  else await batchUpdate(config, updates);

  return readSheet();
}

/* ------------------------------------------------------------------ */
/* Archivar la liquidación actual                                      */
/* ------------------------------------------------------------------ */

const INVALID_SHEET_CHARS = /[:\\/?*[\]]/g;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Nombre para la pestaña de archivo, sin caracteres que Sheets no permite. */
function archiveName(header: HeaderData): string {
  const parts: string[] = [];
  if (header.numeroLiquidacion) parts.push(header.numeroLiquidacion);
  if (header.del || header.al) {
    parts.push(`${header.del || "?"} al ${header.al || "?"}`);
  }
  if (!parts.length) {
    const now = new Date();
    parts.push(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
        now.getHours()
      )}-${pad(now.getMinutes())}`
    );
  }
  return `LIQ ${parts.join(" · ")}`.replace(INVALID_SHEET_CHARS, "-").slice(0, 90).trim();
}

function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/* ------------------------------------------------------------------ */
/* Numeración automática: 2026-001, 2026-002…                          */
/* ------------------------------------------------------------------ */

const LIQ_NUMBER_PATTERN = /(\d{4})-(\d{3,})/;

/** Siguiente número del año en curso, según los nombres ya usados. */
function nextLiquidationNumberFrom(used: string[]): string {
  const year = new Date().getFullYear();
  let max = 0;
  for (const value of used) {
    const match = value.match(LIQ_NUMBER_PATTERN);
    if (!match || Number(match[1]) !== year) continue;
    max = Math.max(max, Number(match[2]));
  }
  return `${year}-${String(max + 1).padStart(3, "0")}`;
}

/** Lee los nombres de las pestañas para saber qué números ya existen. */
async function nextLiquidationNumber(config: Config): Promise<string> {
  const meta = (await googleFetch(config.sheetId, "?fields=sheets.properties.title")) as {
    sheets?: { properties?: { title?: string } }[];
  };
  const titles = (meta.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? "")
    .filter(Boolean);
  return nextLiquidationNumberFrom(titles);
}

/** Escribe el No. de liquidación en AB2. */
async function writeLiquidationNumber(config: Config, number: string) {
  await batchUpdate(config, [
    {
      range: headerRange(config.tab, HEADER_CELLS.numeroLiquidacion),
      values: [[number]],
    },
  ]);
}

/**
 * Guarda la liquidación actual como una pestaña nueva del mismo archivo y deja
 * la pestaña de trabajo en blanco. Así no se pierde nada y no hay que duplicar
 * archivos a mano.
 *
 * El número de liquidación se genera solo (año + consecutivo) y la hoja limpia
 * arranca con el siguiente número.
 */
export async function archiveAndReset(): Promise<{ data: SheetData; archivedAs: string }> {
  const source = dataSource();
  const config = await sheetConfig();
  const current = await readSheet();

  const hasItems = current.items.some((item) => !isItemEmpty(item));
  // El número automático no cuenta como contenido: una hoja en blanco con solo
  // su número no debe generar una pestaña de archivo vacía.
  const hasHeader = (Object.keys(current.header) as (keyof HeaderData)[]).some(
    (key) => key !== "numeroLiquidacion" && current.header[key].trim() !== ""
  );

  if (source === "webhook") {
    throw new Error(
      "Con el webhook de Apps Script no se pueden crear pestañas. Usa la cuenta de servicio para archivar automáticamente."
    );
  }

  if (source === "demo") {
    const archivedAs = hasItems || hasHeader ? archiveName(current.header) : "";
    const data = await resetSheet("all");
    const numero = nextLiquidationNumberFrom([data.header.numeroLiquidacion]);
    return {
      data: { ...data, header: { ...data.header, numeroLiquidacion: numero } },
      archivedAs,
    };
  }

  if (!hasItems && !hasHeader) {
    // Nada que archivar: solo se limpia y se deja listo el número.
    const numero = current.header.numeroLiquidacion || (await nextLiquidationNumber(config));
    const data = await resetSheet("all");
    await writeLiquidationNumber(config, numero);
    return { data: await readSheet(), archivedAs: "" };
  }

  // La liquidación que se archiva también lleva número.
  if (!current.header.numeroLiquidacion) {
    current.header.numeroLiquidacion = await nextLiquidationNumber(config);
    await writeLiquidationNumber(config, current.header.numeroLiquidacion);
  }

  const meta = (await googleFetch(
    config.sheetId,
    "?fields=sheets.properties(sheetId,title,index)"
  )) as { sheets?: { properties?: { sheetId?: number; title?: string; index?: number } }[] };

  const sheets = (meta.sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((props): props is { sheetId?: number; title?: string; index?: number } => Boolean(props));

  const working = sheets.find((sheet) => sheet.title === config.tab);
  if (!working || typeof working.sheetId !== "number") {
    throw new Error(`No se encontró la pestaña "${config.tab}" en la hoja.`);
  }

  const archivedAs = uniqueName(
    archiveName(current.header),
    sheets.map((sheet) => sheet.title ?? "")
  );

  await googleFetch(config.sheetId, ":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: working.sheetId,
            insertSheetIndex: sheets.length,
            newSheetName: archivedAs,
          },
        },
      ],
    }),
  });

  await resetSheet("all");

  // La hoja limpia arranca con el siguiente número.
  const next = await nextLiquidationNumber(config);
  await writeLiquidationNumber(config, next);

  return { data: await readSheet(), archivedAs };
}

/* ------------------------------------------------------------------ */
/* Utilidades internas                                                 */
/* ------------------------------------------------------------------ */

function itemUpdates(tab: string, row: number, item: Item): Update[] {
  const updates: Update[] = [];

  for (const key of Object.keys(ITEM_COLUMNS) as ItemFieldKey[]) {
    const letter = ITEM_COLUMNS[key];
    const raw = itemCellValue(item, key);
    let value: CellValue = raw;

    if (key === "valor" || key === "galones" || key === "inguat") {
      const num = Number(raw.replace(",", "."));
      value = raw === "" ? "" : Number.isFinite(num) ? num : raw;
    }

    updates.push({ range: itemRange(tab, letter, row), values: [[safeCell(value)]] });
  }

  return updates;
}

function safeCell(value: CellValue): CellValue {
  if (typeof value === "string" && value.startsWith("=")) {
    return `'${value}`;
  }
  return value;
}

/**
 * Deja la columna "No." (A) numerada 1..n sin huecos, según las filas con datos.
 * Solo escribe las celdas que realmente cambian.
 */
async function renumberItems(config: Config, source: DataSource) {
  const current = await readSheet();
  const updates: Update[] = [];
  let counter = 0;

  for (const item of current.items) {
    if (isItemEmpty(item)) {
      if (item.no !== "") {
        updates.push({ range: itemRange(config.tab, "A", item.row), values: [[""]] });
      }
      continue;
    }
    counter += 1;
    if (String(counter) !== item.no) {
      updates.push({ range: itemRange(config.tab, "A", item.row), values: [[counter]] });
    }
  }

  if (!updates.length) return;
  if (source === "webhook") await writeViaWebhook(updates);
  else await batchUpdate(config, updates);
}
