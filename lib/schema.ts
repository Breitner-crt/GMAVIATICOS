import type { HeaderData, Item, ItemFieldKey, Totals } from "./types";
import { EMPTY_HEADER, EMPTY_ITEM, TIPO_GASTO_SHEET_VALUES, tipoGastoLabel } from "./types";

/** Columnas reales del formato (pestaña FORMATO DE LIQUIDACION). */
export const ITEM_COLUMNS: Record<ItemFieldKey, string> = {
  proveedor: "B",
  nit: "G",
  tipoDoc: "I",
  serie: "K",
  numero: "L",
  fecha: "M",
  placa: "N",
  concepto: "O",
  tipoGasto: "S",
  valor: "T",
  galones: "U",
  tipoComb: "V",
  inguat: "X",
  pais: "AB",
  sitio: "AC",
  foto: "AD",
};

export const ITEM_FIRST_ROW = 10;
export const ITEM_LAST_ROW = 50;
export const ITEM_CAPACITY = ITEM_LAST_ROW - ITEM_FIRST_ROW + 1;

/** Celdas del encabezado. */
export const HEADER_CELLS: Record<keyof HeaderData, string> = {
  numeroLiquidacion: "AB2",
  del: "B4",
  al: "E4",
  liquidado: "G4",
  destinos: "I4",
  transferencia: "O4",
  cheque: "Q4",
  proyecto: "G6",
  objeto: "I6",
  departamento: "N6",
};

export const TOTALS_CELLS = {
  liquidado: "T70",
  acreditado: "T71",
  tarjeta: "T72",
  corte: "T73",
  diferencia: "T74",
} as const;

/** Índices dentro del arreglo A:AC (A = 0). */
const COL_INDEX: Record<string, number> = {
  A: 0,
  B: 1,
  G: 6,
  I: 8,
  K: 10,
  L: 11,
  M: 12,
  N: 13,
  O: 14,
  S: 18,
  T: 19,
  U: 20,
  V: 21,
  W: 22,
  X: 23,
  Y: 24,
  Z: 25,
  AA: 26,
  AB: 27,
  AC: 28,
  AD: 29,
};

const DAY_MS = 86_400_000;

/** Convierte un serial de Google Sheets a YYYY-MM-DD. */
export function serialToDate(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1) return "";
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * DAY_MS;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function looksLikeSerial(value: unknown): value is number {
  return typeof value === "number" && value > 20_000 && value < 80_000;
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(6)));
  }
  return String(value).trim();
}

export function cellNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return String(Number(value.toFixed(6)));
  const cleaned = String(value).replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

/** Convierte las filas A10:AC50 en objetos Item. */
export function rowsToItems(rows: unknown[][]): Item[] {
  return rows.map((cells, index) => {
    const row = ITEM_FIRST_ROW + index;
    const get = (letter: string) => cells[COL_INDEX[letter]] ?? "";
    const fechaRaw = get("M");
    const fecha = looksLikeSerial(fechaRaw)
      ? serialToDate(fechaRaw as number)
      : cellText(fechaRaw).slice(0, 10);

    return {
      row,
      no: cellText(get("A")),
      proveedor: cellText(get("B")),
      nit: cellText(get("G")),
      tipoDoc: cellText(get("I")).toUpperCase(),
      serie: cellText(get("K")),
      numero: cellText(get("L")),
      fecha,
      placa: cellText(get("N")),
      concepto: cellText(get("O")),
      tipoGasto: tipoGastoLabel(cellText(get("S"))),
      valor: cellNumber(get("T")),
      galones: cellNumber(get("U")),
      tipoComb: cellText(get("V")).toUpperCase(),
      inguat: cellNumber(get("X")),
      pais: cellText(get("AB")),
      sitio: cellText(get("AC")),
      foto: cellText(get("AD")),
      idp: cellNumber(get("W")),
      neto: cellNumber(get("Y")),
      base: cellNumber(get("Z")),
      iva: cellNumber(get("AA")),
    } satisfies Item;
  });
}

export function isItemEmpty(item: Item): boolean {
  return (
    !item.proveedor.trim() &&
    !item.concepto.trim() &&
    !item.valor.trim() &&
    !item.nit.trim() &&
    !item.numero.trim()
  );
}

/** Valor que se escribe en el Sheet para una columna del gasto. */
export function itemCellValue(item: Item, key: ItemFieldKey): string {
  const value = item[key] ?? "";
  if (key === "fecha") return value.slice(0, 10);
  if (key === "tipoDoc" || key === "tipoComb") return value.toUpperCase().trim();
  if (key === "tipoGasto") {
    const label = value.trim();
    return TIPO_GASTO_SHEET_VALUES[label] ?? label;
  }
  return value.trim();
}

export function normalizeItemInput(raw: Partial<Item>): Item {
  const merged = { ...EMPTY_ITEM, ...raw } as Item;
  return {
    ...merged,
    row: Number(raw.row ?? 0),
    no: String(raw.no ?? ""),
    fecha: String(merged.fecha ?? "").slice(0, 10),
    tipoDoc: String(merged.tipoDoc ?? "").toUpperCase().trim(),
    tipoComb: String(merged.tipoComb ?? "").toUpperCase().trim(),
    idp: String(merged.idp ?? ""),
    neto: String(merged.neto ?? ""),
    base: String(merged.base ?? ""),
    iva: String(merged.iva ?? ""),
  };
}

export function normalizeHeaderInput(raw: Partial<HeaderData>): HeaderData {
  const out = { ...EMPTY_HEADER };
  for (const key of Object.keys(HEADER_CELLS) as (keyof HeaderData)[]) {
    out[key] = String(raw[key] ?? "").trim();
  }
  return out;
}

export function headerRange(tab: string, cell: string): string {
  return `'${tab}'!${cell}`;
}

export function itemRange(tab: string, letter: string, row: number): string {
  return `'${tab}'!${letter}${row}`;
}

export function parseTotals(values: unknown[]): Totals {
  const num = (v: unknown) => {
    if (typeof v === "number") return Math.round(v * 100) / 100;
    const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
  };
  return {
    liquidado: num(values[0]),
    acreditado: num(values[1]),
    tarjeta: num(values[2]),
    corte: num(values[3]),
    diferencia: num(values[4]),
  };
}
