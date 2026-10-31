export type HeaderData = {
  numeroLiquidacion: string;
  del: string;
  al: string;
  liquidado: string;
  destinos: string;
  transferencia: string;
  cheque: string;
  proyecto: string;
  objeto: string;
  departamento: string;
};

export type ItemFieldKey =
  | "proveedor"
  | "nit"
  | "tipoDoc"
  | "serie"
  | "numero"
  | "fecha"
  | "placa"
  | "concepto"
  | "tipoGasto"
  | "valor"
  | "galones"
  | "tipoComb"
  | "inguat"
  | "pais"
  | "sitio"
  | "foto";

export type Item = {
  row: number;
  no: string;
  proveedor: string;
  nit: string;
  tipoDoc: string;
  serie: string;
  numero: string;
  fecha: string;
  placa: string;
  concepto: string;
  tipoGasto: string;
  valor: string;
  galones: string;
  tipoComb: string;
  inguat: string;
  pais: string;
  sitio: string;
  /** Enlace de la foto en Google Drive (columna AD). */
  foto: string;
  /** Calculados por el Sheet (solo lectura). */
  idp: string;
  neto: string;
  base: string;
  iva: string;
};

export type Totals = {
  liquidado: number | null;
  acreditado: number | null;
  tarjeta: number | null;
  corte: number | null;
  diferencia: number | null;
};

export type SheetData = {
  header: HeaderData;
  items: Item[];
  totals: Totals;
  meta: {
    sheetId: string;
    tab: string;
    source: "sheets" | "webhook" | "demo";
    firstRow: number;
    lastRow: number;
    capacity: number;
    updatedAt: string;
  };
};

export const TIPO_GASTO_OPTIONS = [
  "Combustible",
  "Viáticos",
  "Hospedaje",
  "Materiales",
  "Proveedores",
  "Comisión",
  "Otros",
] as const;

/**
 * La lista de validación de la hoja (Hoja1!B1:B9) guarda algunos valores con
 * espacio al final. Se escribe el valor exacto para que la validación no marque
 * la celda como inválida.
 */
export const TIPO_GASTO_SHEET_VALUES: Record<string, string> = {
  Combustible: "Combustible ",
  Viáticos: "Viáticos ",
  Hospedaje: "Hospedaje",
  Materiales: "Materiales ",
  Proveedores: "Proveedores ",
  Comisión: "Comisión",
  Otros: "Otros ",
};

/** Normaliza lo que viene de la hoja a la etiqueta limpia del formulario. */
export function tipoGastoLabel(value: string): string {
  const trimmed = value.trim();
  return (TIPO_GASTO_OPTIONS as readonly string[]).includes(trimmed) ? trimmed : value;
}

export const TIPO_DOC_OPTIONS = ["FAC", "FPC", "REC"] as const;

export const TIPO_COMB_OPTIONS = [
  { value: "S", label: "Súper (S)" },
  { value: "R", label: "Regular (R)" },
  { value: "D", label: "Diésel (D)" },
] as const;

export const EMPTY_HEADER: HeaderData = {
  numeroLiquidacion: "",
  del: "",
  al: "",
  liquidado: "",
  destinos: "",
  transferencia: "",
  cheque: "",
  proyecto: "",
  objeto: "",
  departamento: "",
};

export const EMPTY_ITEM: Omit<Item, "row" | "no" | "idp" | "neto" | "base" | "iva"> = {
  proveedor: "",
  nit: "",
  tipoDoc: "FAC",
  serie: "",
  numero: "",
  fecha: "",
  placa: "",
  concepto: "",
  tipoGasto: "",
  valor: "",
  galones: "",
  tipoComb: "",
  inguat: "",
  pais: "GUATEMALA",
  sitio: "",
  foto: "",
};

/** Documento detectado por el OCR (todos los campos son texto). */
export type OcrDocument = {
  proveedor: string;
  nit: string;
  tipoDoc: string;
  serie: string;
  numero: string;
  fecha: string;
  placa: string;
  concepto: string;
  tipoGasto: string;
  valor: string;
  galones: string;
  tipoComb: string;
  inguat: string;
  pais: string;
  sitio: string;
  confianza: "alta" | "media" | "baja";
};

/* ------------------------------------------------------------------ */
/* Alimentación (pestaña ALIMENTACION GMA)                             */
/* ------------------------------------------------------------------ */

export type MealKey = "desayuno" | "almuerzo" | "cena";

export const MEAL_KEYS: MealKey[] = ["desayuno", "almuerzo", "cena"];

export const MEAL_LABELS: Record<MealKey, string> = {
  desayuno: "Desayunos",
  almuerzo: "Almuerzos",
  cena: "Cenas",
};

/** Un día de la malla de 35 días (5 semanas × 7 días) de cada tiempo. */
export type MealDay = {
  /** Posición 0..34 dentro del bloque. */
  index: number;
  /** Fecha YYYY-MM-DD calculada por el Sheet (vacía si no hay fecha inicial). */
  date: string;
  /** Cantidad de la cuadrilla (texto para permitir el campo vacío). */
  cuadrilla: string;
  /** Cantidad del supervisor. */
  supervisor: string;
};

export type MealBlock = {
  key: MealKey;
  label: string;
  /** Primera fecha del bloque (la única que se escribe; el resto son fórmulas). */
  startDate: string;
  costCuadrilla: number | null;
  costSupervisor: number | null;
  days: MealDay[];
  /** Cantidades totales del bloque (fórmulas A3/A4 del Sheet). */
  totalCuadrilla: number;
  totalSupervisor: number;
  /** Costo total del bloque (F3 + F4). */
  total: number;
};

export type AlimentacionData = {
  meals: Record<MealKey, MealBlock>;
  workers: string[];
  supervisor: string;
  meta: {
    sheetId: string;
    tab: string;
    source: "sheets" | "webhook" | "demo";
    updatedAt: string;
  };
};

/** Pestaña de alimentación: la de trabajo o una archivada. */
export type AlimentacionTab = {
  title: string;
  sheetId: number;
  index: number;
  /** true si es una pestaña archivada (no la de trabajo). */
  archived: boolean;
};

export type AlimentacionTabs = {
  working: string;
  tabs: AlimentacionTab[];
};
