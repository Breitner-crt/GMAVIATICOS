"use client";

import type { Item, ItemFieldKey } from "@/lib/types";
import {
  TIPO_COMB_OPTIONS,
  TIPO_DOC_OPTIONS,
  TIPO_GASTO_OPTIONS,
} from "@/lib/types";

export type ItemDraft = Record<ItemFieldKey, string>;

export const EMPTY_DRAFT: ItemDraft = {
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
};

export function draftFromItem(item: Partial<Item>): ItemDraft {
  return {
    proveedor: item.proveedor ?? "",
    nit: item.nit ?? "",
    tipoDoc: item.tipoDoc ?? "FAC",
    serie: item.serie ?? "",
    numero: item.numero ?? "",
    fecha: (item.fecha ?? "").slice(0, 10),
    placa: item.placa ?? "",
    concepto: item.concepto ?? "",
    tipoGasto: item.tipoGasto ?? "",
    valor: item.valor ?? "",
    galones: item.galones ?? "",
    tipoComb: item.tipoComb ?? "",
    inguat: item.inguat ?? "",
    pais: item.pais ?? "GUATEMALA",
    sitio: item.sitio ?? "",
  };
}

type FieldDef = {
  key: ItemFieldKey;
  label: string;
  type: "text" | "date" | "number" | "select";
  options?: readonly string[];
  labels?: Record<string, string>;
  wide?: boolean;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
};

const FIELDS: FieldDef[] = [
  {
    key: "proveedor",
    label: "Proveedor",
    type: "text",
    wide: true,
    placeholder: "Nombre del negocio",
  },
  { key: "nit", label: "NIT", type: "text", placeholder: "1234567-8" },
  {
    key: "tipoDoc",
    label: "Documento",
    type: "select",
    options: TIPO_DOC_OPTIONS,
    labels: { FAC: "FAC · Factura", FPC: "FPC · Pequeño contrib.", REC: "REC · Recibo" },
  },
  { key: "serie", label: "Serie", type: "text", placeholder: "A1B2C3" },
  { key: "numero", label: "No. documento", type: "text", inputMode: "numeric" },
  { key: "fecha", label: "Fecha", type: "date" },
  { key: "placa", label: "Placa", type: "text", placeholder: "P-123ABC" },
  {
    key: "concepto",
    label: "Concepto",
    type: "text",
    wide: true,
    placeholder: "Hospedaje, combustible, almuerzo…",
  },
  {
    key: "tipoGasto",
    label: "Tipo de gasto",
    type: "select",
    options: TIPO_GASTO_OPTIONS,
  },
  { key: "valor", label: "Valor (Q)", type: "number", inputMode: "decimal" },
  { key: "galones", label: "Galones", type: "number", inputMode: "decimal" },
  {
    key: "tipoComb",
    label: "Combustible",
    type: "select",
    options: TIPO_COMB_OPTIONS.map((option) => option.value),
    labels: { "": "—", S: "Súper (S)", R: "Regular (R)", D: "Diésel (D)" },
  },
  { key: "inguat", label: "INGUAT (Q)", type: "number", inputMode: "decimal" },
  { key: "pais", label: "País", type: "text" },
  { key: "sitio", label: "Sitio", type: "text" },
];

type Props = {
  value: ItemDraft;
  onChange: (key: ItemFieldKey, value: string) => void;
  idPrefix?: string;
};

export default function ItemFields({ value, onChange, idPrefix = "item" }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {FIELDS.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        return (
          <div key={field.key} className={field.wide ? "col-span-2" : ""}>
            <label className="field-label" htmlFor={id}>
              {field.label}
            </label>

            {field.type === "select" ? (
              <div className="relative">
                <select
                  id={id}
                  className="field-input appearance-none pr-9"
                  value={value[field.key]}
                  onChange={(event) => onChange(field.key, event.target.value)}
                >
                  <option value="">—</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {field.labels?.[option] ?? option}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5.5 7.5L10 12l4.5-4.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            ) : (
              <input
                id={id}
                className="field-input"
                type={field.type}
                inputMode={field.inputMode}
                step={field.type === "number" ? "any" : undefined}
                placeholder={field.placeholder}
                value={value[field.key]}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
