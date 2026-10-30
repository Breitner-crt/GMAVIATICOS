"use client";

import { useRef, useState, useEffect } from "react";
import type { OcrDocument, SheetData } from "@/lib/types";
import { api, compressImage, scanQrFromBlob } from "@/lib/client";
import { parseGuatemalaQr } from "@/lib/satQr";
import ItemFields, { draftFromItem, type ItemDraft } from "./ItemFields";
import jsQR from "jsqr";

type DocState = {
  id: string;
  photoUrl?: string;
  draft: ItemDraft;
  selected: boolean;
  origen: "qr" | "manual";
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
  const [docs, setDocs] = useState<DocState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveScanner, setLiveScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const selected = docs.filter((doc) => doc.selected);

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
        setError("No se pudo acceder a la cámara para el escaneo del QR.");
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

  function addScannedDoc(partial: Partial<OcrDocument>, origen: "qr" | "manual", photoUrl?: string) {
    const today = new Date().toISOString().split("T")[0];
    const fullDoc: OcrDocument = {
      proveedor: partial.proveedor || "FACTURA DTE (SAT)",
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
      confianza: origen === "qr" ? "alta" : "baja",
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
      const url = URL.createObjectURL(file);
      // Al tomar foto manual, simplemente adjuntamos la imagen y abrimos el formulario limpio
      addScannedDoc({}, "manual", url);
    }

    if (cameraRef.current) cameraRef.current.value = "";
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
      setError("Selecciona al menos un gasto para registrar.");
      return;
    }
    if (selected.length > capacityLeft) {
      setError(`Solo quedan ${capacityLeft} filas libres en el formato.`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      for (const doc of selected) {
        await api<SheetData>("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item: doc.draft, photoUrl: doc.photoUrl }),
        });
      }
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
            <h2 className="text-base font-semibold">Agregar Gasto</h2>
            <p className="text-xs text-slate-500">
              Usa QR para autocompletar o toma una foto para llenar manualmente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
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

          {liveScanner ? (
            <div className="relative overflow-hidden rounded-2xl bg-black aspect-video flex flex-col items-center justify-center">
              <video ref={videoRef} playsInline className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setLiveScanner(false)}
                className="absolute bottom-3 rounded-full bg-slate-900/80 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-center hover:border-emerald-500 hover:bg-emerald-50/50"
              >
                <span className="text-xs font-semibold text-slate-700">📸 Tomar Foto</span>
              </button>

              <button
                type="button"
                onClick={() => setLiveScanner(true)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-center hover:border-emerald-500 hover:bg-emerald-50/50"
              >
                <span className="text-xs font-semibold text-slate-700">📱 Escanear QR</span>
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

          {docs.length > 0 && (
            <div className="space-y-4">
              {docs.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
                  {doc.photoUrl && (
                    <div className="relative max-h-40 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      <img src={doc.photoUrl} alt="Factura" className="h-full w-full object-contain" />
                    </div>
                  )}
                  <ItemFields value={doc.draft} onChange={(k, v) => updateDoc(doc.id, k, v)} />
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:rounded-b-3xl">
          <button
            type="button"
            disabled={!selected.length || busy}
            onClick={save}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Guardando..." : "Guardar en Drive y Sheets"}
          </button>
        </footer>
      </div>
    </div>
  );
}
