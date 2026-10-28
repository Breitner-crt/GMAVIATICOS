import type { SheetData } from "./types";
import { EMPTY_ITEM } from "./types";
import { ITEM_CAPACITY } from "./schema";

const header = {
  numeroLiquidacion: "ND-9994022",
  del: "2026-10-02",
  al: "2026-10-14",
  liquidado: "2026-10-21",
  destinos: "PUERTO BARRIOS",
  transferencia: "ND-9994022",
  cheque: "BANCO PROMERICA",
  proyecto: "SBA 2026",
  objeto: "INSTALACION DE MONOPOLOS IASA",
  departamento: "PROYECTOS",
};

const seed = [
  {
    proveedor: "HOTEL LA PAZ",
    nit: "17629349",
    tipoDoc: "FAC",
    serie: "089DBD33",
    numero: "2680701214",
    fecha: "2026-10-04",
    placa: "",
    concepto: "HOSPEDAJE 5 Personas 160 c/u",
    tipoGasto: "Hospedaje",
    valor: "800",
    galones: "",
    tipoComb: "",
    inguat: "",
    pais: "GUATEMALA",
    sitio: "PUERTO BARRIOS",
  },
  {
    proveedor: "UNO GUATEMALA",
    nit: "321052",
    tipoDoc: "FAC",
    serie: "36B62114",
    numero: "748241533",
    fecha: "2026-10-19",
    placa: "P-123ABC",
    concepto: "COMBUSTIBLE",
    tipoGasto: "Combustible",
    valor: "300",
    galones: "7.3",
    tipoComb: "S",
    inguat: "",
    pais: "GUATEMALA",
    sitio: "ESCUINTLA",
  },
  {
    proveedor: "COMERCIAL LA CEIBA",
    nit: "76697630",
    tipoDoc: "FAC",
    serie: "ED53512F",
    numero: "1969899549",
    fecha: "2026-10-14",
    placa: "",
    concepto: "HERRAMIENTAS",
    tipoGasto: "Otros",
    valor: "20",
    galones: "",
    tipoComb: "",
    inguat: "",
    pais: "GUATEMALA",
    sitio: "TECULUTAN",
  },
];

function compute(item: {
  tipoDoc: string;
  valor: string;
  galones: string;
  inguat: string;
  tipoComb: string;
}) {
  const valor = Number(item.valor || 0);
  const galones = Number(item.galones || 0);
  const inguat = Number(item.inguat || 0);
  const idp =
    item.tipoComb === "D"
      ? galones * 1.3
      : item.tipoComb === "R"
        ? galones * 4.6
        : item.tipoComb === "S"
          ? galones * 4.7
          : 0;
  const neto =
    item.tipoDoc === "FPC" || item.tipoDoc === "REC"
      ? valor
      : inguat > 0
        ? (valor - inguat) / 1.12
        : (valor - idp) / 1.12;
  const base =
    item.tipoDoc === "FPC" || item.tipoDoc === "REC"
      ? 0
      : inguat > 0
        ? (valor - inguat) / 1.12 + inguat
        : (valor - idp) / 1.12 + idp;
  const iva = item.tipoDoc === "FPC" || item.tipoDoc === "REC" ? 0 : neto * 0.12;
  const round = (n: number) => String(Math.round(n * 100) / 100);
  return { idp: round(idp), neto: round(neto), base: round(base), iva: round(iva) };
}

function build(): SheetData {
  const items = seed.map((item, index) => {
    const calc = compute(item);
    return {
      row: 10 + index,
      no: String(index + 1),
      ...EMPTY_ITEM,
      ...item,
      ...calc,
    };
  });

  for (let i = items.length; i < ITEM_CAPACITY; i += 1) {
    items.push({
      row: 10 + i,
      no: "",
      ...EMPTY_ITEM,
      idp: "",
      neto: "",
      base: "",
      iva: "",
    });
  }

  const liquidado = seed.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const acreditado = 11120;
  const corte = 0;

  return {
    header: { ...header },
    items,
    totals: {
      liquidado,
      acreditado,
      tarjeta: acreditado - corte,
      corte,
      diferencia: acreditado - corte - liquidado,
    },
    meta: {
      sheetId: "demo",
      tab: "FORMATO DE LIQUIDACION",
      source: "demo",
      firstRow: 10,
      lastRow: 50,
      capacity: ITEM_CAPACITY,
      updatedAt: new Date().toISOString(),
    },
  };
}

// Almacén en memoria: solo para DEMO_MODE. No persiste ni toca Google.
let store: SheetData | null = null;

export function demoRead(): SheetData {
  if (!store) store = build();
  return structuredClone(store);
}

export function demoWriteHeader(header: SheetData["header"]): SheetData {
  const data = demoRead();
  data.header = { ...header };
  data.meta.updatedAt = new Date().toISOString();
  store = data;
  return data;
}

export function demoAddItem(item: Omit<SheetData["items"][number], "row" | "no">): SheetData {
  const data = demoRead();
  const target = data.items.find(
    (row) => !row.proveedor && !row.concepto && !row.valor
  );
  if (!target) throw new Error("No hay filas libres en el formato.");
  Object.assign(target, item);
  Object.assign(target, compute(target));
  renumber(data);
  recompute(data);
  store = data;
  return data;
}

export function demoUpdateItem(row: number, item: Partial<SheetData["items"][number]>): SheetData {
  const data = demoRead();
  const target = data.items.find((entry) => entry.row === row);
  if (!target) throw new Error("Fila no encontrada.");
  const { no: _no, row: _row, ...changes } = item;
  Object.assign(target, changes, { row });
  Object.assign(target, compute(target));
  recompute(data);
  store = data;
  return data;
}

export function demoDeleteItem(row: number): SheetData {
  const data = demoRead();
  const index = data.items.findIndex((entry) => entry.row === row);
  if (index < 0) throw new Error("Fila no encontrada.");
  data.items[index] = {
    row,
    no: "",
    ...EMPTY_ITEM,
    idp: "",
    neto: "",
    base: "",
    iva: "",
  };
  renumber(data);
  recompute(data);
  store = data;
  return data;
}

export function demoSaveTotals(values: { acreditado?: number; corte?: number }): SheetData {
  const data = demoRead();
  if (typeof values.acreditado === "number") data.totals.acreditado = values.acreditado;
  if (typeof values.corte === "number") data.totals.corte = values.corte;
  recompute(data);
  store = data;
  return data;
}

function renumber(data: SheetData) {
  let n = 0;
  for (const item of data.items) {
    if (item.proveedor || item.concepto || item.valor) {
      n += 1;
      item.no = String(n);
    } else {
      item.no = "";
    }
  }
}

function recompute(data: SheetData) {
  data.totals.liquidado = data.items.reduce(
    (sum, item) => sum + Number(item.valor || 0),
    0
  );
  const acreditado = data.totals.acreditado ?? 0;
  const corte = data.totals.corte ?? 0;
  data.totals.tarjeta = acreditado - corte;
  data.totals.diferencia = acreditado - corte - data.totals.liquidado;
  data.meta.updatedAt = new Date().toISOString();
}
