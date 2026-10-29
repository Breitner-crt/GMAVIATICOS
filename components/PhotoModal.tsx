"use client";

import { useRef, useState, useEffect } from "react";
import type { OcrDocument, SheetData } from "@/lib/types";
import { api, compressImage, scanQrFromBlob } from "@/lib/client";
import { runLocalOcr } from "@/lib/localOcr";
import { parseGuatemalaQr } from "@/lib/satQr";
import ItemFields, { draftFromItem, type ItemDraft } from "./ItemFields";
import jsQR from "jsqr";

type PhotoState = {
  id: string;
  url: string;
  status: "reading" | "done" | "error";
  hasQr?: boolean;
};

type DocState = {
  id: string;
  photoUrl?: string;
  draft: ItemDraft;
  selected: boolean;
  origen: "qr" | "ocr" | "manual";
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
  capacityLeft,
  onClose,
  onSaved,
  onManual,
}: Props) {
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [docs, setDocs] = useState<DocState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveScanner, setLiveScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const selected = docs.filter((doc) => doc.selected);

  // Escáner en vivo con cámara de video
  useEffect(() => {
    if (!liveScanner) return;
    let stream: MediaStream | null = null;
    let animId: number;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          requestAnimationFrame(scanVideoFrame);
        }
      } catch (err) {
        setError("No se pudo acceder a la cámara para el escaneo en vivo.");
        setLiveScanner(false);
      }
    }

    function scanVideoFrame() {
      if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
        animId = requestAnimationFrame(scanVideoFrame);
        return;
      }

      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, canvas.width, canvas.height);

        if (code && code.data) {
          // QR Detectado en vivo
          const parsed = parseGuatemalaQr(code.data);
          addScannedDoc(parsed, "qr");
          setLiveScanner(false);
          return;
        }
      }
      animId = requestAnimationFrame(scanVideoFrame);
    }

    startCamera();

    return () => {
      cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [liveScanner]);

  function addScannedDoc(partial: Partial<OcrDocument>, origen: "qr" | "ocr" | "manual", photoUrl?: string) {
    const today = new Date().toISOString().split("T")[0];
    const fullDoc: OcrDocument = {
      proveedor: partial.proveedor || (origen === "qr" ? "PROVEEDOR DTE (SAT)" : "ESTABLECIMIENTO"),
      nit: partial.nit || "",
      tipoDoc: partial.tipoDoc || "FAC",
      serie: partial.serie || "",
      numero: partial.numero || "",
      fecha: partial.fecha || today,
      placa: partial.placa || "",
      concepto: partial.concepto || "CONSUMO GENERAL",
      tipoGasto: partial.tipoGasto || "Viáticos",
      valor: partial.valor || "0",
      galones: partial.galones || "",
      tipoComb: partial.tipoComb || "",
      inguat: partial.inguat || "",
      pais: "GUATEMALA",
      sitio: "",
      confianza: origen === "qr" ? "alta" : origen === "ocr" ? "alta" : "media",
    };

    setDocs((prev) => [
      ...prev,
      {
        id: nextId(),
        photoUrl,
        draft: draftFromItem(fullDoc),
        selected: true,
        origen,
      },
    ]);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setError(null);

    for (const file of Array.from(files)) {
      const id = nextId();
      const url = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { id, url, status: "reading" }]);

      try {
        // Redimensionar para fluidez y precisión de OCR (~1600px)
        const blob = await compressImage(file, 1600);

        // 1. Intentar escanear QR de SAT primero (si la imagen lo trae, es 100% exacto)
        const qrContent = await scanQrFromBlob(blob);

        if (qrContent) {
          const parsed = parseGuatemalaQr(qrContent);
          addScannedDoc(parsed, "qr", url);
          setPhotos((prev) =>
            prev.map((photo) => (photo.id === id ? { ...photo, status: "done", hasQr: true } : photo))
          );
        } else {
          // 2. Sin QR: ejecutar motor OCR interno (Tesseract local + parser Guatemala)
          const doc = await runLocalOcr(blob);
          addScannedDoc(doc, "ocr", url);
          setPhotos((prev) =>
            prev.map((photo) => (photo.id === id ? { ...photo, status: "done", hasQr: false } : photo))
          );
        }
      } catch (err) {
        // Si el motor local falla por algún motivo en la imagen, activamos modo asistido
        addScannedDoc({}, "manual", url);
        setPhotos((prev) =>
          prev.map((photo) => (photo.id === id ? { ...photo, status: "done", hasQr: false } : photo))
        );
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

  function setQuickCategory(id: string, cat: string) {
    updateDoc(id, "tipoGasto", cat);
    if (cat === "Combustible") {
      updateDoc(id, "concepto", "CONSUMO DE COMBUSTIBLE");
    } else if (cat === "Hospedaje") {
      updateDoc(id, "concepto", "HOSPEDAJE");
    } else {
      updateDoc(id, "concepto", "ALIMENTACIÓN / VIÁTICOS");
    }
  }

  async function save() {
    if (!selected.length) {
      setError("Selecciona al menos un gasto para registrar.");
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
            <h2 className="text-base font-semibold">Captura Rápida de Comprobantes</h2>
            <p className="text-xs text-slate-500">
              Lectura automática local (QR SAT o motor OCR interno) sin depender de servidores externos.
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

          {/* Escáner en vivo de QR */}
          {liveScanner ? (
            <div className="relative overflow-hidden rounded-2xl bg-black aspect-video flex flex-col items-center justify-center">
              <video ref={videoRef} playsInline className="h-full w-full object-cover" />
              <div className="absolute inset-0 border-2 border-emerald-400/80 rounded-2xl pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-dashed border-white/80 rounded-xl" />
              </div>
              <button
                type="button"
                onClick={() => setLiveScanner(false)}
                className="absolute bottom-3 rounded-full bg-slate-900/80 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm"
              >
                Cancelar escáner
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-center hover:border-emerald-500 hover:bg-emerald-50/50"
              >
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-xs font-semibold text-slate-700">Tomar foto</span>
              </button>

              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-center hover:border-emerald-500 hover:bg-emerald-50/50"
              >
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-semibold text-slate-700">De galería</span>
              </button>

              <button
                type="button"
                onClick={() => setLiveScanner(true)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-center hover:border-emerald-500 hover:bg-emerald-50/50"
              >
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span className="text-xs font-semibold text-slate-700">Escanear QR</span>
              </button>
            </div>
          )}

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

          {/* Indicador de lectura */}
          {photos.some((p) => p.status === "reading") && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
              </svg>
              Extrayendo datos de la factura con motor local…
            </div>
          )}
          {/* Lista de gastos detectados o por completar */}
          {docs.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Gastos listos para liquidar ({docs.length})
              </h3>
              {docs.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={doc.selected}
                        onChange={() => toggleDoc(doc.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      Incluir en la liquidación
                    </label>
                    {doc.origen === "qr" ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                        ✓ Factura SAT (QR Oficial)
                      </span>
                    ) : doc.origen === "ocr" ? (
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-800 uppercase tracking-wide">
                        ✓ Datos extraídos con OCR
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 uppercase">
                        Foto de comprobante
                      </span>
                    )}
                  </div>

                  {/* Foto de comprobante con zoom asistido */}
                  {doc.photoUrl && (
                    <div className="space-y-2">
                      <div className="relative max-h-48 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        <img
                          src={doc.photoUrl}
                          alt="Comprobante"
                          className="h-full w-full object-contain cursor-zoom-in"
                          onClick={() => window.open(doc.photoUrl, "_blank")}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 text-center">
                        (Toca la imagen para verla en pantalla completa)
                      </p>
                    </div>
                  )}

                  {/* Botones de Categoría Rápida */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600">Categoría rápida:</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: "⛽ Gasolina", val: "Combustible" },
                        { label: "🍽️ Viáticos", val: "Viáticos" },
                        { label: "🏨 Hotel", val: "Hospedaje" },
                        { label: "📦 Otros", val: "Otros" },
                      ].map((cat) => (
                        <button
                          key={cat.val}
                          type="button"
                          onClick={() => setQuickCategory(doc.id, cat.val)}
                          className={`rounded-xl py-1.5 text-[11px] font-semibold transition ${doc.draft.tipoGasto === cat.val
                              ? "bg-emerald-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Campos editables */}
                  <ItemFields value={doc.draft} onChange={(k, v) => updateDoc(doc.id, k, v)} />
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
