"use client";

import { useEffect, useMemo, useState } from "react";
import type { HeaderData, Item, SheetData } from "@/lib/types";
import { isItemEmpty } from "@/lib/schema";
import { api, formatDate, money } from "@/lib/client";
import ItemFields, { EMPTY_DRAFT, draftFromItem, type ItemDraft } from "./ItemFields";
import PhotoModal from "./PhotoModal";
import SheetSettings from "./SheetSettings";
import NewLiquidation from "./NewLiquidation";

type Tab = "form" | "items" | "totals";

type Props = {
  initial: SheetData;
  ocrEnabled: boolean;
  serviceAccountEmail: string | null;
};

type HeaderField = {
  key: keyof HeaderData;
  label: string;
  type?: "text" | "date";
  wide?: boolean;
  placeholder?: string;
};

const HEADER_GROUPS: { title: string; hint?: string; fields: HeaderField[] }[] = [
  {
    title: "Documento",
    fields: [
      { key: "numeroLiquidacion", label: "No. liquidación", wide: true, placeholder: "Automático: 2026-001" },
      { key: "transferencia", label: "No. de transferencia" },
      { key: "cheque", label: "Cheque de banco" },
    ],
  },
  {
    title: "Periodo del viaje",
    fields: [
      { key: "del", label: "Del", type: "date" },
      { key: "al", label: "Al", type: "date" },
      { key: "liquidado", label: "Liquidado", type: "date" },
    ],
  },
  {
    title: "Viaje",
    fields: [
      { key: "proyecto", label: "Proyecto" },
      { key: "departamento", label: "Departamento de trabajo" },
      { key: "objeto", label: "Objeto del viaje", wide: true },
      { key: "destinos", label: "Destino(s)", wide: true },
    ],
  },
];

const SOURCE_LABEL: Record<SheetData["meta"]["source"], string> = {
  demo: "Demostración",
  sheets: "Google Sheets",
  webhook: "Apps Script",
};

export default function AppShell({ initial, ocrEnabled, serviceAccountEmail }: Props) {
  const [data, setData] = useState<SheetData>(initial);
  const [tab, setTab] = useState<Tab>("items");
  const [header, setHeader] = useState<HeaderData>(initial.header);
  const [totalsDraft, setTotalsDraft] = useState({
    acreditado: initial.totals.acreditado != null ? String(initial.totals.acreditado) : "",
    corte: initial.totals.corte != null ? String(initial.totals.corte) : "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; type: "ok" | "error" } | null>(null);
  const [editing, setEditing] = useState<{
    mode: "new" | "edit";
    row?: number;
    draft: ItemDraft;
    item?: Item;
  } | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newLiqOpen, setNewLiqOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const usedItems = useMemo(() => data.items.filter((item) => !isItemEmpty(item)), [data.items]);
  const capacityLeft = data.items.length - usedItems.length;
  const totalGastos = usedItems.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const isDemo = data.meta.source === "demo";
  const headerDirty = JSON.stringify(header) !== JSON.stringify(data.header);

  function notify(text: string, type: "ok" | "error" = "ok") {
    setToast({ text, type });
  }

  function applyData(next: SheetData, message?: string) {
    setData(next);
    setHeader(next.header);
    setTotalsDraft({
      acreditado: next.totals.acreditado != null ? String(next.totals.acreditado) : "",
      corte: next.totals.corte != null ? String(next.totals.corte) : "",
    });
    if (message) notify(message);
  }

  async function refresh() {
    setBusy("refresh");
    try {
      applyData(await api<SheetData>("/api/sheet"), "Datos actualizados.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo actualizar.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveHeader() {
    setBusy("header");
    try {
      const next = await api<SheetData>("/api/header", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header }),
      });
      applyData(next, "Datos generales guardados.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo guardar.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveItem() {
    if (!editing) return;
    setBusy("item");
    try {
      const isNew = editing.mode === "new";
      const next = await api<SheetData>("/api/items", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isNew ? { item: editing.draft } : { row: editing.row, item: editing.draft }
        ),
      });
      setEditing(null);
      applyData(next, isNew ? "Gasto agregado." : "Gasto actualizado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo guardar.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function removeItem() {
    if (!editing?.row) return;
    if (!window.confirm("¿Eliminar este gasto del formato?")) return;
    setBusy("item");
    try {
      const next = await api<SheetData>("/api/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: editing.row }),
      });
      setEditing(null);
      applyData(next, "Gasto eliminado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo eliminar.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveTotals() {
    setBusy("totals");
    try {
      const next = await api<SheetData>("/api/totals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acreditado: totalsDraft.acreditado === "" ? null : Number(totalsDraft.acreditado),
          corte: totalsDraft.corte === "" ? null : Number(totalsDraft.corte),
        }),
      });
      applyData(next, "Totales actualizados.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo guardar.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="bg-gradient-to-br from-brand-700 via-brand-700 to-brand-800 text-white">
        <div className="mx-auto w-full max-w-3xl px-4 pt-safe pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100">
                Liquidación de viáticos
              </p>
              <h1 className="mt-0.5 truncate text-xl font-semibold">
                {header.proyecto || "Formato principal"}
              </h1>
              <p className="mt-0.5 truncate text-xs text-brand-100">
                {header.numeroLiquidacion || "Número automático"} · {data.meta.tab}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
                aria-label="Hoja de cálculo"
                title="Elegir hoja de cálculo"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M4 10h16M4 15h16M10 4v16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={refresh}
                disabled={busy === "refresh"}
                className="rounded-full p-2 text-white/90 transition hover:bg-white/10 disabled:opacity-50"
                aria-label="Recargar datos"
                title="Recargar desde el Sheet"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
                aria-label="Salir"
                title="Cerrar sesión"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="chip bg-white/15 text-white">{SOURCE_LABEL[data.meta.source]}</span>
            <span className="chip bg-white/10 text-brand-50">
              {usedItems.length}/{data.meta.capacity} gastos
            </span>
            <span className="chip bg-white/10 text-brand-50">Total {money(totalGastos)}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">
        {isDemo && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <b>Modo demostración.</b> Los cambios no se guardan en Google. Configura las
            credenciales en Vercel para conectar tu hoja.
          </div>
        )}

        {tab === "form" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setNewLiqOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3.5 text-left transition hover:bg-brand-100"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-brand-900">Nueva liquidación</span>
                <span className="block text-xs text-brand-800/80">
                  Archiva la actual y deja el formato en blanco
                </span>
              </span>
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0 text-brand-700"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {HEADER_GROUPS.map((group) => (
              <section key={group.title} className="card p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">{group.title}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {group.fields.map((field) => (
                    <div key={field.key} className={field.wide ? "col-span-2" : ""}>
                      <label className="field-label" htmlFor={`header-${field.key}`}>
                        {field.label}
                      </label>
                      <input
                        id={`header-${field.key}`}
                        type={field.type ?? "text"}
                        className="field-input"
                        placeholder={field.placeholder}
                        value={header[field.key]}
                        onChange={(event) =>
                          setHeader((prev) => ({ ...prev, [field.key]: event.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <button
              type="button"
              onClick={saveHeader}
              disabled={busy === "header" || !headerDirty}
              className="btn-primary w-full"
            >
              {busy === "header" ? "Guardando…" : "Guardar datos generales"}
            </button>
            <p className="text-center text-xs text-slate-500">
              Estos datos se escriben en las celdas del encabezado del formato.
            </p>
          </div>
        )}

        {tab === "items" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left shadow-sm transition ${
                ocrEnabled
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "border border-dashed border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                  ocrEnabled ? "bg-white/15" : "bg-slate-100 text-slate-500"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6h6.6l1 1.6h1.2A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9Z" />
                  <circle cx="12" cy="13" r="3.4" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Capturar factura con foto</span>
                <span
                  className={`block text-xs ${ocrEnabled ? "text-brand-100" : "text-slate-500"}`}
                >
                  {ocrEnabled
                    ? "La IA lee los datos y tú los revisas antes de guardar"
                    : "Lectura automática no configurada: agrega los gastos a mano"}
                </span>
              </span>
              <svg
                viewBox="0 0 24 24"
                className={`h-5 w-5 shrink-0 ${ocrEnabled ? "text-brand-100" : "text-slate-400"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Gastos ({usedItems.length})
              </h2>
              <button
                type="button"
                onClick={() =>
                  setEditing({ mode: "new", draft: { ...EMPTY_DRAFT } })
                }
                className="btn-secondary px-3 py-2 text-xs"
              >
                + Nuevo gasto
              </button>
            </div>

            {usedItems.length === 0 && (
              <div className="card px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">Todavía no hay gastos</p>
                <p className="mt-1 text-xs text-slate-500">
                  Toma una foto de la factura o agrega un gasto manualmente.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {usedItems.map((item) => (
                <button
                  key={item.row}
                  type="button"
                  onClick={() =>
                    setEditing({ mode: "edit", row: item.row, draft: draftFromItem(item), item })
                  }
                  className="card w-full px-4 py-3.5 text-left transition hover:border-brand-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-brand-700">
                          #{item.no || "—"}
                        </span>
                        {item.tipoGasto && (
                          <span className="chip bg-slate-100 text-slate-600">
                            {item.tipoGasto}
                          </span>
                        )}
                        {item.tipoDoc && (
                          <span className="chip bg-brand-50 text-brand-700">{item.tipoDoc}</span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                        {item.proveedor || "Sin proveedor"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {item.concepto || "Sin concepto"}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-slate-400">
                        {formatDate(item.fecha)}
                        {item.serie || item.numero
                          ? ` · ${[item.serie, item.numero].filter(Boolean).join("-")}`
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-900">{money(item.valor)}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">IVA {money(item.iva)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "totals" && (
          <div className="space-y-4">
            <section className="card divide-y divide-slate-100">
              <Row label="Total liquidado" value={money(data.totals.liquidado)} hint="Suma de los gastos (fórmula del Sheet)" />
              <div className="px-4 py-3">
                <label className="field-label" htmlFor="total-acreditado">
                  Monto acreditado (Q)
                </label>
                <input
                  id="total-acreditado"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  className="field-input"
                  value={totalsDraft.acreditado}
                  onChange={(event) =>
                    setTotalsDraft((prev) => ({ ...prev, acreditado: event.target.value }))
                  }
                />
              </div>
              <Row label="Gastos con tarjeta" value={money(data.totals.tarjeta)} hint="Acreditado − corte (fórmula)" />
              <div className="px-4 py-3">
                <label className="field-label" htmlFor="total-corte">
                  Corte (Q)
                </label>
                <input
                  id="total-corte"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  className="field-input"
                  value={totalsDraft.corte}
                  onChange={(event) =>
                    setTotalsDraft((prev) => ({ ...prev, corte: event.target.value }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Diferencia a reintegrar</p>
                  <p className="text-[11px] text-slate-500">Gastos con tarjeta − total liquidado</p>
                </div>
                <p
                  className={`text-lg font-bold ${
                    (data.totals.diferencia ?? 0) < 0 ? "text-red-600" : "text-brand-700"
                  }`}
                >
                  {money(data.totals.diferencia)}
                </p>
              </div>
            </section>

            <button
              type="button"
              onClick={saveTotals}
              disabled={busy === "totals"}
              className="btn-primary w-full"
            >
              {busy === "totals" ? "Guardando…" : "Guardar totales"}
            </button>

            <p className="text-center text-xs text-slate-500">
              El total liquidado, los gastos con tarjeta y la diferencia son fórmulas del
              formato: se recalculan solos en Google Sheets.
            </p>

            <button
              type="button"
              onClick={() => setNewLiqOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-white px-4 py-3.5 text-left transition hover:bg-brand-50"
            >
              <span>
                <span className="block text-sm font-semibold text-brand-900">Nueva liquidación</span>
                <span className="block text-xs text-slate-500">
                  Archiva esta y deja el formato en blanco
                </span>
              </span>
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0 text-brand-700"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl pb-safe">
          <TabButton active={tab === "form"} onClick={() => setTab("form")} label="Formulario" icon="form" />
          <TabButton active={tab === "items"} onClick={() => setTab("items")} label={`Gastos (${usedItems.length})`} icon="receipt" />
          <TabButton active={tab === "totals"} onClick={() => setTab("totals")} label="Totales" icon="chart" />
        </div>
      </nav>

      {photoOpen && (
        <PhotoModal
          ocrEnabled={ocrEnabled}
          capacityLeft={capacityLeft}
          onClose={() => setPhotoOpen(false)}
          onSaved={(next) => applyData(next, "Gastos agregados al formato.")}
          onManual={() => {
            setPhotoOpen(false);
            setEditing({ mode: "new", draft: { ...EMPTY_DRAFT } });
          }}
        />
      )}

      {newLiqOpen && (
        <NewLiquidation
          header={header}
          usedCount={usedItems.length}
          total={totalGastos}
          onClose={() => setNewLiqOpen(false)}
          onDone={(next, archivedAs) =>
            applyData(
              next,
              archivedAs
                ? `Liquidación archivada como «${archivedAs}».`
                : "Formato limpio para una liquidación nueva."
            )
          }
        />
      )}

      {settingsOpen && (
        <SheetSettings
          sheetId={data.meta.sheetId}
          tab={data.meta.tab}
          serviceAccountEmail={serviceAccountEmail}
          onClose={() => setSettingsOpen(false)}
          onChanged={(next, message) => applyData(next, message)}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white sm:rounded-3xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">
                  {editing.mode === "new" ? "Nuevo gasto" : `Editar gasto #${editing.item?.no || ""}`}
                </h2>
                <p className="text-xs text-slate-500">
                  {editing.mode === "new"
                    ? "Se agregará en la primera fila libre del formato."
                    : `Fila ${editing.row} del formato`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <ItemFields
                value={editing.draft}
                onChange={(key, value) =>
                  setEditing((prev) =>
                    prev ? { ...prev, draft: { ...prev.draft, [key]: value } } : prev
                  )
                }
                idPrefix="edit"
              />

              {editing.mode === "edit" && editing.item && (
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-4">
                  <Computed label="IDP" value={money(editing.item.idp)} />
                  <Computed label="Valor neto" value={money(editing.item.neto)} />
                  <Computed label="Base" value={money(editing.item.base)} />
                  <Computed label="IVA" value={money(editing.item.iva)} />
                </div>
              )}
            </div>

            <footer className="flex gap-2 border-t border-slate-200 px-4 py-3 pb-safe sm:px-5">
              {editing.mode === "edit" && (
                <button type="button" onClick={removeItem} className="btn-danger px-3" disabled={busy === "item"}>
                  Eliminar
                </button>
              )}
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveItem}
                className="btn-primary flex-[1.4]"
                disabled={busy === "item"}
              >
                {busy === "item" ? "Guardando…" : "Guardar gasto"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-lg ${
            toast.type === "error" ? "bg-red-700 text-white" : "bg-slate-900 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      </div>
      <p className="text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Computed({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-medium text-slate-700">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: "form" | "receipt" | "chart";
}) {
  const paths: Record<typeof icon, string> = {
    form: "M7 4h7l4 4v12H7V4Zm7 0v4h4M10 12h6M10 16h6",
    receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6",
    chart: "M5 19V9m5 10V5m5 14v-7m5 7V8",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
        active ? "text-brand-700" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d={paths[icon]} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
