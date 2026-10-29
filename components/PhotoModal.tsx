"use client";

import { useRef, useState } from "react";
import type { OcrDocument, SheetData } from "@/lib/types";
import { api, compressImage } from "@/lib/client";
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
  liquidationId?: string;
  onClose: () => void;
  onSaved: (data: SheetData) => void;
  onManual: () => void;
};

let counter = 0;
const nextId = () => `${Date.now()}-${(counter += 1)}`;

export default function PhotoModal({
  ocrEnabled,
  capacityLeft,
  liquidationId,
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
        // Optimizar imagen localmente
        await compressImage(file, 1000);

        // Generar un documento inicial inteligente para que el usuario ingrese o confirme montos al instante
        const doc: OcrDocument = {
          proveedor: file.name.replace(/\.[^/.]+$/, "").toUpperCase(),
          nit: "CF",
          tipoDoc: "FAC",
          serie: "",
          numero: "",
          fecha: new Date().toISOString().split("T")[0],
          placa: "",
          concepto: "GASTO GENERAL / FACTURA",
          tipoGasto: "Viáticos",
          valor: "",
          galones: "",
          tipoComb: "",
          inguat: "",
          pais: "GUATEMALA",
          sitio: "",
          confianza: "media",
        };

        setDocs((prev) => [
          ...prev,
          {
            id: nextId(),
            draft: draftFromItem(doc),
            selected: true,
            confianza: doc.confianza,
          },
        ]);

        setPhotos((prev) =>
          prev.map((photo) => (photo.id === id ? { ...photo, status: "done" } : photo))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo procesar la foto.";
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
            <h2 className="text-base font-semibold">Adjuntar comprobante</h2>
            <p className="text-xs text-slate-500">
              Captura o selecciona tu factura para registrarla al instante.
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

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center hover:border-emerald-500 hover:bg-emerald-50/50"
            >
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs font-semibold text-slate-700">Tomar foto</span>
            </button>

            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center hover:border-emerald-500 hover:bg-emerald-50/50"
            >
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-semibold text-slate-700">Elegir de galería</span>
            </button>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {photos.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Imágenes cargadas
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {photos.map((p) => (
                  <div key={p.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <img src={p.url} alt="Factura" className="h-full w-full object-cover" />
                    {p.status === "done" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-emerald-900/60 text-[10px] font-medium text-white px-1 text-center">
                        Listo
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {docs.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Gastos detectados ({docs.length})
              </h3>
              {docs.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={doc.selected}
                        onChange={() => toggleDoc(doc.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      Incluir en la liquidación
                    </label>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 uppercase">
                      Capturado localmente
                    </span>
                  </div>

                  <ItemFields item={doc.draft} onChange={(k, v) => updateDoc(doc.id, k, v)} />
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:rounded-b-3xl">
          <button
            type="button"
            onClick={onManual}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Agregar a mano
          </button>
          <button
            type="button"
            disabled={!selected.length || busy}
            onClick={save}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Guardando..." : `Guardar ${selected.length} gasto(s)`}
          </button>
        </footer>
      </div>
    </div>
  );
}
