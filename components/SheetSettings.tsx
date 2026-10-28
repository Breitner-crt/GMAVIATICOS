"use client";

import { useState } from "react";
import type { SheetData } from "@/lib/types";
import { api } from "@/lib/client";

type Props = {
  sheetId: string;
  tab: string;
  serviceAccountEmail: string | null;
  onClose: () => void;
  onChanged: (data: SheetData, message: string) => void;
};

export default function SheetSettings({
  sheetId,
  tab,
  serviceAccountEmail,
  onClose,
  onChanged,
}: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const canReset = confirmText.trim().toUpperCase() === "BORRAR";

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  async function useSheet() {
    if (!input.trim()) {
      setError("Pega el ID o la URL de la hoja.");
      return;
    }
    setBusy("sheet");
    setError(null);
    try {
      const data = await api<SheetData>("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: input }),
      });
      setInput("");
      onChanged(data, "Hoja cambiada.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo usar esa hoja.");
    } finally {
      setBusy(null);
    }
  }

  async function reset(scope: "items" | "all") {
    setBusy(scope);
    setError(null);
    try {
      const data = await api<SheetData>("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      setConfirmText("");
      onChanged(
        data,
        scope === "all" ? "Formato vaciado por completo." : "Gastos borrados."
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo vaciar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-xl flex-col rounded-t-3xl bg-slate-50 sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:rounded-t-3xl">
          <div>
            <h2 className="text-base font-semibold">Hoja de cálculo</h2>
            <p className="text-xs text-slate-500">Elige en qué hoja se guarda todo.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <section className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Hoja activa
            </p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">{sheetId}</p>
            <p className="mt-1 text-xs text-slate-500">Pestaña: {tab}</p>
            <button
              type="button"
              onClick={() => copy(sheetId, "id")}
              className="btn-secondary mt-3 w-full text-xs"
            >
              {copied === "id" ? "Copiado" : "Copiar ID"}
            </button>
          </section>

          <section className="card p-4">
            <h3 className="text-sm font-semibold text-slate-800">Usar otra hoja</h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-slate-600">
              <li>
                En Google Sheets: <b>Archivo → Hacer una copia</b> (la copia se comparte igual).
              </li>
              <li>
                Comparte la copia con la cuenta de servicio como <b>Editor</b>.
              </li>
              <li>Pega aquí el ID o la URL completa de la copia.</li>
            </ol>

            {serviceAccountEmail && (
              <div className="mt-3 rounded-xl bg-slate-100 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Compartir con
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-700">
                  {serviceAccountEmail}
                </p>
                <button
                  type="button"
                  onClick={() => copy(serviceAccountEmail, "email")}
                  className="btn-secondary mt-2 w-full text-xs"
                >
                  {copied === "email" ? "Copiado" : "Copiar correo"}
                </button>
              </div>
            )}

            <input
              className="field-input mt-3 font-mono text-xs"
              placeholder="1AbC...xyz o https://docs.google.com/spreadsheets/d/..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <button
              type="button"
              onClick={useSheet}
              disabled={busy === "sheet" || !input.trim()}
              className="btn-primary mt-3 w-full"
            >
              {busy === "sheet" ? "Verificando…" : "Probar y usar esta hoja"}
            </button>
          </section>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Borrar sin archivar</h3>
            <p className="mt-1 text-xs text-slate-600">
              Para terminar una liquidación usa el botón <b>Nueva liquidación</b> de la
              pestaña Formulario: guarda una copia como pestaña nueva y deja el formato
              en blanco. Esta sección es solo para descartar lo que hay ahora, sin
              guardar copia.
            </p>
            <input
              className="field-input mt-3"
              placeholder="Escribe BORRAR para confirmar"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoCapitalize="characters"
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => reset("items")}
                disabled={!canReset || busy !== null}
                className="btn-danger flex-1"
              >
                {busy === "items" ? "Borrando…" : "Borrar solo gastos"}
              </button>
              <button
                type="button"
                onClick={() => reset("all")}
                disabled={!canReset || busy !== null}
                className="btn-danger flex-1"
              >
                {busy === "all" ? "Borrando…" : "Borrar gastos y encabezado"}
              </button>
            </div>
          </section>
        </div>

        <footer className="border-t border-slate-200 bg-white px-4 py-3 pb-safe sm:rounded-b-3xl sm:px-5">
          <button type="button" onClick={onClose} className="btn-secondary w-full">
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
