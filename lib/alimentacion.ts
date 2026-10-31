import { hasServiceAccount } from "./google";
import {
  activeSheetId,
  dataSource,
  sheetBatchUpdate,
  sheetFetch,
  type Update,
} from "./sheets";
import { cellText, looksLikeSerial, serialToDate } from "./schema";
import { MEAL_KEYS } from "./types";
import type {
  AlimentacionData,
  AlimentacionTab,
  AlimentacionTabs,
  MealBlock,
  MealDay,
  MealKey,
} from "./types";

/**
 * Pestaña de alimentación dentro del mismo archivo de Google Sheets.
 * Se puede cambiar con la variable de entorno ALIMENTACION_TAB.
 */
export const ALIMENTACION_TAB =
  process.env.ALIMENTACION_TAB?.trim() || "ALIMENTACION GMA";

type BlockDef = {
  key: MealKey;
  label: string;
  /** Fila donde está la única fecha real del bloque. */
  firstDateRow: number;
  /** Filas de fechas (una por semana). */
  dateRows: number[];
  /** Filas de cantidades de la cuadrilla (una por semana). */
  cuadrillaRows: number[];
  /** Filas de cantidades del supervisor (una por semana). */
  supervisorRows: number[];
  qtyCuadrillaCell: string;
  qtySupervisorCell: string;
  costCuadrillaCell: string;
  costSupervisorCell: string;
  totalCostCuadrillaCell: string;
  totalCostSupervisorCell: string;
};

const BLOCKS: BlockDef[] = [
  {
    key: "desayuno",
    label: "Desayunos",
    firstDateRow: 6,
    dateRows: [6, 9, 12, 15, 18],
    cuadrillaRows: [7, 10, 13, 16, 19],
    supervisorRows: [8, 11, 14, 17, 20],
    qtyCuadrillaCell: "A3",
    qtySupervisorCell: "A4",
    costCuadrillaCell: "C3",
    costSupervisorCell: "C4",
    totalCostCuadrillaCell: "F3",
    totalCostSupervisorCell: "F4",
  },
  {
    key: "almuerzo",
    label: "Almuerzos",
    firstDateRow: 26,
    dateRows: [26, 29, 32, 35, 38],
    cuadrillaRows: [27, 30, 33, 36, 39],
    supervisorRows: [28, 31, 34, 37, 40],
    qtyCuadrillaCell: "A23",
    qtySupervisorCell: "A24",
    costCuadrillaCell: "C23",
    costSupervisorCell: "C24",
    totalCostCuadrillaCell: "F23",
    totalCostSupervisorCell: "F24",
  },
  {
    key: "cena",
    label: "Cenas",
    firstDateRow: 46,
    dateRows: [46, 49, 52, 55, 58],
    cuadrillaRows: [47, 50, 53, 56, 59],
    supervisorRows: [48, 51, 54, 57, 60],
    qtyCuadrillaCell: "A43",
    qtySupervisorCell: "A44",
    costCuadrillaCell: "C43",
    costSupervisorCell: "C44",
    totalCostCuadrillaCell: "F43",
    totalCostSupervisorCell: "F44",
  },
];

const BLOCK_BY_KEY = BLOCKS.reduce<Record<MealKey, BlockDef>>((acc, block) => {
  acc[block.key] = block;
  return acc;
}, {} as Record<MealKey, BlockDef>);

const DAY_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];
const GRID_ROWS = 61;
const DAYS_PER_BLOCK = 35;

const COL_INDEX: Record<string, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
  G: 6,
  H: 7,
  I: 8,
  J: 9,
};

function quotedRange(tab: string, a1Range: string): string {
  return `'${tab}'!${a1Range}`;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

async function readGrid(sheetId: string, tab: string): Promise<unknown[][]> {
  const range = encodeURIComponent(quotedRange(tab, `A1:J${GRID_ROWS}`));
  const data = (await sheetFetch(
    sheetId,
    `/values/${range}?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`
  )) as { values?: unknown[][] };

  const rows = data.values ?? [];
  const grid: unknown[][] = [];
  for (let i = 0; i < GRID_ROWS; i += 1) grid.push(rows[i] ?? []);
  return grid;
}

function cellValue(grid: unknown[][], row: number, col: string): unknown {
  return grid[row - 1]?.[COL_INDEX[col]] ?? "";
}

function splitCell(cell: string): { row: number; col: string } {
  const match = cell.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { row: 0, col: "A" };
  return { row: Number(match[2]), col: match[1] };
}

function asDate(value: unknown): string {
  if (looksLikeSerial(value)) return serialToDate(value);
  const text = cellText(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function asQty(value: unknown): string {
  const num = asNumber(value);
  return num === null ? "" : String(num);
}

function gridNumber(grid: unknown[][], cell: string): number | null {
  const { row, col } = splitCell(cell);
  return asNumber(cellValue(grid, row, col));
}

function buildMeals(grid: unknown[][]): Record<MealKey, MealBlock> {
  const meals = {} as Record<MealKey, MealBlock>;

  for (const def of BLOCKS) {
    const days: MealDay[] = [];
    let index = 0;

    for (let week = 0; week < def.dateRows.length; week += 1) {
      for (let day = 0; day < 7; day += 1) {
        const col = DAY_LETTERS[day];
        days.push({
          index,
          date: asDate(cellValue(grid, def.dateRows[week], col)),
          cuadrilla: asQty(cellValue(grid, def.cuadrillaRows[week], col)),
          supervisor: asQty(cellValue(grid, def.supervisorRows[week], col)),
        });
        index += 1;
      }
    }

    const sum = (key: "cuadrilla" | "supervisor") =>
      days.reduce((total, day) => total + Number(day[key] || 0), 0);

    meals[def.key] = {
      key: def.key,
      label: def.label,
      startDate: asDate(cellValue(grid, def.firstDateRow, "A")),
      costCuadrilla: gridNumber(grid, def.costCuadrillaCell),
      costSupervisor: gridNumber(grid, def.costSupervisorCell),
      days,
      totalCuadrilla: gridNumber(grid, def.qtyCuadrillaCell) ?? sum("cuadrilla"),
      totalSupervisor: gridNumber(grid, def.qtySupervisorCell) ?? sum("supervisor"),
      total:
        (gridNumber(grid, def.totalCostCuadrillaCell) ?? 0) +
        (gridNumber(grid, def.totalCostSupervisorCell) ?? 0),
    };
  }

  return meals;
}

/**
 * La columna J guarda el listado con este formato:
 *   J1: TRABAJADORES
 *   J2..Jn: nombres
 *   Jn+1: SUPERVISOR
 *   Jn+2: nombre del supervisor
 */
function parseNames(grid: unknown[][]): { workers: string[]; supervisor: string } {
  const workers: string[] = [];
  let supervisor = "";
  let mode: "workers" | "supervisor" = "workers";

  for (let row = 1; row <= GRID_ROWS; row += 1) {
    const line = cellText(cellValue(grid, row, "J"));
    if (!line) continue;

    const upper = line.toUpperCase();
    if (upper === "TRABAJADORES") {
      mode = "workers";
      continue;
    }
    if (upper === "SUPERVISOR") {
      mode = "supervisor";
      continue;
    }

    if (mode === "supervisor") {
      if (!supervisor) supervisor = line;
    } else {
      workers.push(line);
    }
  }

  return { workers, supervisor };
}

function buildData(
  grid: unknown[][],
  sheetId: string,
  tab: string,
  source: AlimentacionData["meta"]["source"]
): AlimentacionData {
  const { workers, supervisor } = parseNames(grid);
  return {
    meals: buildMeals(grid),
    workers,
    supervisor,
    meta: {
      sheetId,
      tab,
      source,
      updatedAt: new Date().toISOString(),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Modo demostración                                                   */
/* ------------------------------------------------------------------ */

let demoState: AlimentacionData | null = null;

function emptyMeals(): Record<MealKey, MealBlock> {
  const meals = {} as Record<MealKey, MealBlock>;
  for (const def of BLOCKS) {
    meals[def.key] = {
      key: def.key,
      label: def.label,
      startDate: "",
      costCuadrilla: def.key === "almuerzo" ? 40 : 30,
      costSupervisor: def.key === "almuerzo" ? 50 : 40,
      days: Array.from({ length: DAYS_PER_BLOCK }, (_, index) => ({
        index,
        date: "",
        cuadrilla: "",
        supervisor: "",
      })),
      totalCuadrilla: 0,
      totalSupervisor: 0,
      total: 0,
    };
  }
  return meals;
}

function demoData(): AlimentacionData {
  if (!demoState) {
    demoState = {
      meals: emptyMeals(),
      workers: [],
      supervisor: "",
      meta: {
        sheetId: "demo",
        tab: ALIMENTACION_TAB,
        source: "demo",
        updatedAt: new Date().toISOString(),
      },
    };
  }
  return demoState;
}

function recomputeDemo() {
  const data = demoData();
  for (const key of MEAL_KEYS) {
    const block = data.meals[key];
    const qtyCuadrilla = block.days.reduce((sum, day) => sum + Number(day.cuadrilla || 0), 0);
    const qtySupervisor = block.days.reduce((sum, day) => sum + Number(day.supervisor || 0), 0);
    block.totalCuadrilla = qtyCuadrilla;
    block.totalSupervisor = qtySupervisor;
    block.total =
      qtyCuadrilla * (block.costCuadrilla ?? 0) + qtySupervisor * (block.costSupervisor ?? 0);
  }
  data.meta.updatedAt = new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* Escritura                                                           */
/* ------------------------------------------------------------------ */

function qtyCell(value: string | number | null | undefined): string | number {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const num = Number(text.replace(",", "."));
  return Number.isFinite(num) ? num : text;
}

function cleanQty(value: string | number | null | undefined): string {
  const cell = qtyCell(value);
  return cell === "" ? "" : String(cell);
}

function safeName(value: string): string {
  const text = value.trim();
  return text.startsWith("=") ? `'${text}` : text;
}

async function write(updates: Update[]) {
  if (!updates.length) return;
  const sheetId = await activeSheetId();
  await sheetBatchUpdate(sheetId, updates);
}

function requireSheets() {
  if (!hasServiceAccount()) {
    throw new Error(
      "La pestaña de Alimentación necesita la cuenta de servicio de Google configurada."
    );
  }
}

export async function readAlimentacion(
  tab: string = ALIMENTACION_TAB
): Promise<AlimentacionData> {
  if (dataSource() === "demo") return demoData();
  requireSheets();
  const sheetId = await activeSheetId();
  const grid = await readGrid(sheetId, tab);
  return buildData(grid, sheetId, tab, "sheets");
}

/** Pestaña de trabajo + pestañas archivadas (ALIM …), las más recientes primero. */
export async function listAlimentacionTabs(): Promise<AlimentacionTabs> {
  if (dataSource() === "demo") {
    return {
      working: ALIMENTACION_TAB,
      tabs: [{ title: ALIMENTACION_TAB, sheetId: 0, index: 0, archived: false }],
    };
  }

  requireSheets();
  const sheetId = await activeSheetId();
  const meta = (await sheetFetch(sheetId, "?fields=sheets.properties(sheetId,title,index)")) as {
    sheets?: { properties?: { sheetId?: number; title?: string; index?: number } }[];
  };

  const all = (meta.sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((props): props is { sheetId?: number; title?: string; index?: number } =>
      Boolean(props)
    );

  const workingProps = all.find((props) => props.title === ALIMENTACION_TAB);
  const working: AlimentacionTab = {
    title: ALIMENTACION_TAB,
    sheetId: workingProps?.sheetId ?? 0,
    index: workingProps?.index ?? 0,
    archived: false,
  };

  const archives = all
    .flatMap((props): AlimentacionTab[] => {
      if (typeof props.title !== "string" || !props.title.startsWith("ALIM ")) return [];
      return [
        {
          title: props.title,
          sheetId: props.sheetId ?? 0,
          index: props.index ?? 0,
          archived: true,
        },
      ];
    })
    .sort((a, b) => b.title.localeCompare(a.title));

  return { working: ALIMENTACION_TAB, tabs: [working, ...archives] };
}

export async function saveAlimentacionDay(input: {
  meal: MealKey;
  index: number;
  cuadrilla: string;
  supervisor: string;
  tab?: string;
}): Promise<AlimentacionData> {
  const def = BLOCK_BY_KEY[input.meal];
  if (!def) throw new Error("Tiempo de comida inválido.");

  const index = Number(input.index);
  if (!Number.isInteger(index) || index < 0 || index >= DAYS_PER_BLOCK) {
    throw new Error("Día fuera de rango.");
  }

  const tab = input.tab?.trim() || ALIMENTACION_TAB;

  if (dataSource() === "demo") {
    const data = demoData();
    const day = data.meals[input.meal].days[index];
    day.cuadrilla = cleanQty(input.cuadrilla);
    day.supervisor = cleanQty(input.supervisor);
    recomputeDemo();
    return demoData();
  }

  const week = Math.floor(index / 7);
  const col = DAY_LETTERS[index % 7];

  await write([
    {
      range: quotedRange(tab, `${col}${def.cuadrillaRows[week]}`),
      values: [[qtyCell(input.cuadrilla)]],
    },
    {
      range: quotedRange(tab, `${col}${def.supervisorRows[week]}`),
      values: [[qtyCell(input.supervisor)]],
    },
  ]);

  return readAlimentacion(tab);
}

export async function saveAlimentacionSetup(input: {
  meal: MealKey;
  startDate?: string;
  costCuadrilla?: number | null;
  costSupervisor?: number | null;
  tab?: string;
}): Promise<AlimentacionData> {
  const def = BLOCK_BY_KEY[input.meal];
  if (!def) throw new Error("Tiempo de comida inválido.");

  const tab = input.tab?.trim() || ALIMENTACION_TAB;

  if (dataSource() === "demo") {
    const data = demoData();
    const block = data.meals[input.meal];
    if (input.startDate !== undefined) block.startDate = String(input.startDate).slice(0, 10);
    if (input.costCuadrilla !== undefined) block.costCuadrilla = input.costCuadrilla;
    if (input.costSupervisor !== undefined) block.costSupervisor = input.costSupervisor;
    recomputeDemo();
    return demoData();
  }

  const updates: Update[] = [];

  if (input.startDate !== undefined) {
    updates.push({
      range: quotedRange(tab, `A${def.firstDateRow}`),
      values: [[String(input.startDate ?? "").slice(0, 10)]],
    });
  }
  if (input.costCuadrilla !== undefined) {
    updates.push({
      range: quotedRange(tab, def.costCuadrillaCell),
      values: [[input.costCuadrilla ?? ""]],
    });
  }
  if (input.costSupervisor !== undefined) {
    updates.push({
      range: quotedRange(tab, def.costSupervisorCell),
      values: [[input.costSupervisor ?? ""]],
    });
  }

  await write(updates);
  return readAlimentacion(tab);
}

export async function saveAlimentacionNames(input: {
  workers: string[];
  supervisor: string;
  tab?: string;
}): Promise<AlimentacionData> {
  const workers = (Array.isArray(input.workers) ? input.workers : [])
    .map((worker) => String(worker).trim())
    .filter(Boolean);
  const supervisor = String(input.supervisor ?? "").trim();
  const tab = input.tab?.trim() || ALIMENTACION_TAB;

  if (dataSource() === "demo") {
    const data = demoData();
    data.workers = workers;
    data.supervisor = supervisor;
    data.meta.updatedAt = new Date().toISOString();
    return demoData();
  }

  const lines = ["TRABAJADORES", ...workers, "SUPERVISOR", supervisor];
  const values = Array.from({ length: GRID_ROWS }, (_, i) => [safeName(lines[i] ?? "")]);

  await write([{ range: quotedRange(tab, `J1:J${GRID_ROWS}`), values }]);
  return readAlimentacion(tab);
}

/* ------------------------------------------------------------------ */
/* Archivo                                                             */
/* ------------------------------------------------------------------ */

const INVALID_SHEET_CHARS = /[:\\/?*[\]]/g;

function archiveBaseName(data: AlimentacionData): string {
  const start = data.meals.desayuno.startDate || new Date().toISOString().slice(0, 10);
  return `ALIM ${start}`.replace(INVALID_SHEET_CHARS, "-").slice(0, 90).trim();
}

function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/**
 * Duplica la pestaña actual con los datos del periodo, y deja la pestaña de
 * trabajo limpia (sin cantidades ni nombres). Conserva costos y fechas, que
 * son la configuración del formato.
 */
export async function archiveAlimentacion(): Promise<{
  data: AlimentacionData;
  archivedAs: string;
}> {
  const current = await readAlimentacion();
  const hasData =
    MEAL_KEYS.some((key) =>
      current.meals[key].days.some((day) => day.cuadrilla !== "" || day.supervisor !== "")
    ) ||
    current.workers.length > 0 ||
    current.supervisor !== "";

  if (dataSource() === "demo") {
    const archivedAs = hasData ? archiveBaseName(current) : "";
    const data = demoData();
    for (const key of MEAL_KEYS) {
      for (const day of data.meals[key].days) {
        day.cuadrilla = "";
        day.supervisor = "";
      }
    }
    data.workers = [];
    data.supervisor = "";
    recomputeDemo();
    return { data: demoData(), archivedAs };
  }

  requireSheets();
  const sheetId = await activeSheetId();
  const meta = (await sheetFetch(sheetId, "?fields=sheets.properties(sheetId,title,index)")) as {
    sheets?: { properties?: { sheetId?: number; title?: string; index?: number } }[];
  };

  const sheets = (meta.sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((props): props is { sheetId?: number; title?: string; index?: number } =>
      Boolean(props)
    );

  const working = sheets.find((sheet) => sheet.title === ALIMENTACION_TAB);
  if (!working || typeof working.sheetId !== "number") {
    throw new Error(`No se encontró la pestaña «${ALIMENTACION_TAB}».`);
  }

  let archivedAs = "";
  if (hasData) {
    archivedAs = uniqueName(
      archiveBaseName(current),
      sheets.map((sheet) => sheet.title ?? "")
    );

    await sheetFetch(sheetId, ":batchUpdate", {
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
  }

  const updates: Update[] = [];

  for (const def of BLOCKS) {
    for (const row of [...def.cuadrillaRows, ...def.supervisorRows]) {
      updates.push({
        range: quotedRange(ALIMENTACION_TAB, `A${row}:G${row}`),
        values: [["", "", "", "", "", "", ""]],
      });
    }
  }

  updates.push({
    range: quotedRange(ALIMENTACION_TAB, `J1:J${GRID_ROWS}`),
    values: Array.from({ length: GRID_ROWS }, () => [""]),
  });

  await write(updates);
  return { data: await readAlimentacion(), archivedAs };
}

/* ------------------------------------------------------------------ */
/* Restaurar una liquidación archivada en la pestaña de trabajo        */
/* ------------------------------------------------------------------ */

/**
 * Copia los datos de una pestaña archivada a la pestaña de trabajo para
 * seguir llenándola. Si la pestaña de trabajo tiene datos, primero se archiva
 * para no perderlos.
 */
export async function restoreAlimentacion(sourceTab: string): Promise<{
  data: AlimentacionData;
  archivedAs: string;
}> {
  const source = sourceTab.trim();
  if (!source) throw new Error("Selecciona una liquidación archivada.");
  if (source === ALIMENTACION_TAB) {
    throw new Error("Esa ya es la pestaña de trabajo.");
  }

  const archived = await readAlimentacion(source);
  const current = await readAlimentacion();
  const currentHasData =
    MEAL_KEYS.some((key) =>
      current.meals[key].days.some((day) => day.cuadrilla !== "" || day.supervisor !== "")
    ) ||
    current.workers.length > 0 ||
    current.supervisor !== "";

  if (dataSource() === "demo") {
    return { data: demoData(), archivedAs: "" };
  }

  let archivedAs = "";
  if (currentHasData) {
    const result = await archiveAlimentacion();
    archivedAs = result.archivedAs;
  }

  const updates: Update[] = [];

  for (const def of BLOCKS) {
    const block = archived.meals[def.key];

    updates.push({
      range: quotedRange(ALIMENTACION_TAB, `A${def.firstDateRow}`),
      values: [[block.startDate]],
    });
    updates.push({
      range: quotedRange(ALIMENTACION_TAB, def.costCuadrillaCell),
      values: [[block.costCuadrilla ?? ""]],
    });
    updates.push({
      range: quotedRange(ALIMENTACION_TAB, def.costSupervisorCell),
      values: [[block.costSupervisor ?? ""]],
    });

    for (let week = 0; week < def.dateRows.length; week += 1) {
      const slice = block.days.slice(week * 7, week * 7 + 7);
      updates.push({
        range: quotedRange(
          ALIMENTACION_TAB,
          `A${def.cuadrillaRows[week]}:G${def.cuadrillaRows[week]}`
        ),
        values: [slice.map((day) => qtyCell(day.cuadrilla))],
      });
      updates.push({
        range: quotedRange(
          ALIMENTACION_TAB,
          `A${def.supervisorRows[week]}:G${def.supervisorRows[week]}`
        ),
        values: [slice.map((day) => qtyCell(day.supervisor))],
      });
    }
  }

  const lines = ["TRABAJADORES", ...archived.workers, "SUPERVISOR", archived.supervisor];
  updates.push({
    range: quotedRange(ALIMENTACION_TAB, `J1:J${GRID_ROWS}`),
    values: Array.from({ length: GRID_ROWS }, (_, i) => [safeName(lines[i] ?? "")]),
  });

  await write(updates);
  return { data: await readAlimentacion(), archivedAs };
}
