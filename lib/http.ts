import type { SheetData } from "./types";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}

export function jsonError(error: unknown) {
  return Response.json({ error: errorMessage(error) }, { status: 400 });
}

export function summarize(data: SheetData) {
  const used = data.items.filter(
    (item) => item.proveedor || item.concepto || item.valor
  ).length;
  return { used, capacity: data.meta.capacity };
}
