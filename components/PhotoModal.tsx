"use client";

import { useRef, useState, useEffect } from "react";
import type { OcrDocument, SheetData } from "@/lib/types";
import { api, compressImage } from "@/lib/client";
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
  
  // States para el modal de foto individual
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState<{url: string, id: string} | null>(null);

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
    const file = files[0];
    const url = URL.createObjectURL(file);
    setCurrentPhoto({ url, id: nextId() });
    setPhotoModalOpen(true);
    if (cameraRef.current) cameraRef.current.value = "";
  }

  function savePhotoManual() {
    if (currentPhoto) {
      addScannedDoc({}, "manual", currentPhoto.url);
      setPhotoModalOpen(false);
      setCurrentPhoto(null);
    }
  }

  function updateDoc(id: string, key: keyof ItemDraft, value: string) {
    setDocs((prev) =>
      prev.map((doc) =>
        doc.id === id ? { ...doc, draft: { ...doc.draft, [key]: value } } : doc
      )
    );
  }

  async function save() {
    setBusy(true);
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
      setError("No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-6">
      {/* MODAL DE LLENADO MANUAL POST-FOTO */}
      {photoModalOpen && currentPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Llenar datos de factura</h3>
            <img src={currentPhoto.url} className="w-full h-48 object-contain mb-4 rounded-xl bg-slate-100" />
            <ItemFields value={draftFromItem({} as any)} onChange={(k, v) => {}} />
            <button onClick={savePhotoManual} className="w-full mt-4 bg-emerald-600 text-white py-3 rounded-xl font-bold">
              Guardar datos
            </button>
          </div>
        </div>
      )}

      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-3xl bg-slate-50 sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:rounded-t-3xl">
          <h2 className="text-base font-semibold">Captura de Gastos</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-500">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {liveScanner ? (
            <div className="relative rounded-2xl bg-black aspect-video flex flex-col items-center justify-center">
              <video ref={videoRef} playsInline className="h-full w-full object-cover" />
              <button onClick={() => setLiveScanner(false)} className="absolute bottom-3 bg-white/20 px-4 py-1 rounded-full text-white text-xs">Cancelar</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => cameraRef.current?.click()} className="p-4 border-2 border-dashed rounded-2xl text-center text-xs font-semibold">📸 Tomar Foto</button>
              <button onClick={() => setLiveScanner(true)} className="p-4 border-2 border-dashed rounded-2xl text-center text-xs font-semibold">📱 Escanear QR</button>
            </div>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />

          {docs.length > 0 && (
            <div className="space-y-4">
              {docs.map((doc) => (
                <div key={doc.id} className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
                   <ItemFields value={doc.draft} onChange={(k, v) => updateDoc(doc.id, k, v)} />
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="p-5 border-t bg-white">
          <button disabled={!selected.length || busy} onClick={save} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold">
            {busy ? "Guardando..." : "Guardar todo en Drive y Sheets"}
          </button>
        </footer>
      </div>
    </div>
  );
}
