"use client";

import { useState } from "react";
import type { SheetData } from "@/lib/types";
import { api, money } from "@/lib/client";

type Props = {
  header: SheetData["header"];
  usedCount: number;
  total: number;
  onClose: () => void;
  onDone: (data: SheetData, archivedAs: string) => void;
};

export default function NewLiquidation({ header, usedCount, total, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<SheetData & { archivedAs?: string }>("/api/new-liquidation", {
        method: "POST",
      });
      const { archivedAs, ...data } = result;
      onDone(data as SheetData, archivedAs ?? "");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo archivar.");
    } finally {
      setBusy(false);
    }
  }

  const shortDate = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  };

  const label =
    header.numeroLiquidacion ||
    (header.del || header.al
      ? `${shortDate(header.del) || "?"} al ${shortDate(header.al) || "?"}`
      : "liquidación sin número");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-t-3xl bg-white sm:rounded-3xl">
        <div className="px-5 py-5">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand-700">
            Nueva liquidación
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            ¿Archivar la liquidación actual?
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Se guardará una copia completa como pestaña nueva en el mismo archivo
            y el formato quedará en blanco para empezar otra.
          </p>

          <dl className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Liquidación</dt>
              <dd className="truncate font-medium text-slate-800">{label}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Gastos</dt>
              <dd className="font-medium text-slate-800">{usedCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Total</dt>
              <dd className="font-medium text-slate-800">{money(total)}</dd>
            </div>
          </dl>

          {usedCount === 0 && (
            <p className="mt-3 text-xs text-slate-500">
              La liquidación está vacía: solo se limpiará el formato.
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-200 px-5 py-3 pb-safe">
          <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={busy}>
            Cancelar
          </button>
          <button type="button" onClick={archive} className="btn-primary flex-[1.4]" disabled={busy}>
            {busy ? "Archivando…" : "Archivar y empezar otra"}
          </button>
        </div>
      </div>
    </div>
  );
}
