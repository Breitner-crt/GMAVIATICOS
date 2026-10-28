"use client";

import { useRef, useState } from "react";
import type { OcrDocument, SheetData } from "@/lib/types";
import { api, compressImage, money } from "@/lib/client";
import ItemFields, { draftFromItem, type ItemDraft } from "./ItemFields";

type PhotoState = {
  id: string;
  url: string;
  status: "reading" | "done" | "error";
  error?: string;
};

type DocState = {
  id: string;
  draft: ItemDraft;
  selected: boolean;
  confianza: string;
};

type Props = {
  ocrEnabled: boolean;
  capacityLeft: number;
  onClose: () => void;
  onSaved: (data: SheetData) => void;
  onManual: () => void;
};

let counter = 0;
const nextId = () => `${Date.now()}-${(counter += 1)}`;

export default function PhotoModal({
  ocrEnabled,
  capacityLeft,
  onClose,
  onSaved,
  onManual,
}: Props) {
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [docs, setDocs] = useState<DocState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const selected = docs.filter((doc) => doc.selected);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setError(null);

    for (const file of Array.from(files)) {
      const id = nextId();
      const url = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { id, url, status: "reading" }]);

      try {
        const blob = await compressImage(file);
        const form = new FormData();
        form.append("photo", new File([blob], "factura.jpg", { type: "image/jpeg" }));

        const result = await api<{ documents: OcrDocument[] }>("/api/ocr", {
          method: "POST",
          body: form,
        });

        setDocs((prev) => [
          ...prev,
          ...result.documents.map((doc) => ({
            id: nextId(),
            draft: draftFromItem(doc),
            selected: true,
            confianza: doc.confianza,
          })),
        ]);
        setPhotos((prev) =>
          prev.map((photo) => (photo.id === id ? { ...photo, status: "done" } : photo))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo leer la foto.";
        setPhotos((prev) =>
          prev.map((photo) =>
            photo.id === id ? { ...photo, status: "error", error: message } : photo
          )
        );
        setError(message);
      }
    }

    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  function updateDoc(id: string, key: keyof ItemDraft, value: string) {
    setDocs((prev) =>
      prev.map((doc) =>
        doc.id === id ? { ...doc, draft: { ...doc.draft, [key]: value } } : doc
      )
    );
  }

  function toggleDoc(id: string) {
    setDocs((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, selected: !doc.selected } : doc))
    );
  }

  async function save() {
    if (!selected.length) {
      setError("Selecciona al menos un gasto.");
      return;
    }
    if (selected.length > capacityLeft) {
      setError(`Solo quedan ${capacityLeft} filas libres en el formato.`);
      return;
    }

    setBusy(true);
    setError(null);
    let latest: SheetData | null = null;

    try {
      for (const doc of selected) {
        latest = await api<SheetData>("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item: doc.draft }),
        });
        setDocs((prev) => prev.filter((item) => item.id !== doc.id));
      }
      if (latest) onSaved(latest);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-3xl bg-slate-50 sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:rounded-t-3xl">
          <div>
            <h2 className="text-base font-semibold">Capturar facturas</h2>
            <p className="text-xs text-slate-500">
              Toma la foto y revisa los datos antes de guardar.
            </p>
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
          {!ocrEnabled && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              La lectura automática no está activada (falta <code>GEMINI_API_KEY</code> en
              Vercel). Puedes capturar el gasto a mano con el botón de abajo.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!ocrEnabled || busy}
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-6 text-brand-800 transition hover:bg-brand-100 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6h6.6l1 1.6h1.2A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9Z" />
                <circle cx="12" cy="13" r="3.4" />
              </svg>
              <span className="text-sm font-semibold">Tomar foto</span>
            </button>

            <button
              type="button"
              disabled={!ocrEnabled || busy}
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="M4.5 17l4.8-4.6 3.2 3 2.6-2.3 4.4 3.9" />
              </svg>
              <span className="text-sm font-semibold">Galería</span>
            </button>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />

          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {photos.map((photo) => (
                <div key={photo.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="Factura" className="h-full w-full object-cover" />
                  {photo.status === "reading" && (
                    <div className="absolute inset-0 grid place-items-center bg-slate-900/55 text-[10px] font-semibold text-white">
                      Leyendo…
                    </div>
                  )}
                  {photo.status === "error" && (
                    <div className="absolute inset-0 grid place-items-center bg-red-600/70 px-1 text-center text-[10px] font-semibold text-white">
                      Error
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {docs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  {docs.length} documento{docs.length === 1 ? "" : "s"} detectado
                  {docs.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-slate-500">{selected.length} seleccionado(s)</p>
              </div>

              {docs.map((doc, index) => (
                <div
                  key={doc.id}
                  className={`rounded-2xl border bg-white p-4 transition ${
                    doc.selected ? "border-brand-300 ring-1 ring-brand-200" : "border-slate-200 opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={doc.selected}
                      onChange={() => toggleDoc(doc.id)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      aria-label={`Incluir documento ${index + 1}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {doc.draft.proveedor || "Proveedor sin identificar"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {doc.draft.concepto || "Sin concepto"} · {doc.draft.fecha || "sin fecha"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">
                        {money(doc.draft.valor)}
                      </p>
                      <span
                        className={`chip mt-1 ${
                          doc.confianza === "alta"
                            ? "bg-brand-50 text-brand-700"
                            : doc.confianza === "baja"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {doc.confianza}
                      </span>
                    </div>
                  </div>

                  <details className="mt-3 group">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-brand-700">
                      Revisar y corregir datos
                    </summary>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <ItemFields
                        value={doc.draft}
                        onChange={(key, value) => updateDoc(doc.id, key, value)}
                        idPrefix={doc.id}
                      />
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}

          {!photos.length && ocrEnabled && (
            <p className="text-center text-xs text-slate-500">
              Consejo: enfoca la factura completa, con buena luz y sin sombras.
            </p>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-white px-4 py-3 pb-safe sm:rounded-b-3xl sm:px-5">
          {ocrEnabled ? (
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={busy}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                className="btn-primary flex-[1.4]"
                disabled={busy || !selected.length}
              >
                {busy
                  ? "Guardando…"
                  : selected.length
                    ? `Agregar ${selected.length} al formato`
                    : "Agregar al formato"}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">
                Cerrar
              </button>
              <button type="button" onClick={onManual} className="btn-primary flex-[1.4]">
                Agregar gasto a mano
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
