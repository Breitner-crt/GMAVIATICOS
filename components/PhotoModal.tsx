"use client";

// Forzar despliegue de almacenamiento de fotos Base64
import { useRef, useState, useEffect } from "react";
import type { SheetData } from "@/lib/types";
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
  
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState<{url: string, file: File} | null>(null);

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
        setError("No se pudo acceder a la cámara.");
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
      const ctx = canvas.getContext("2d");
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

  function addScannedDoc(partial: any, origen: "qr" | "manual", photoUrl?: string) {
    const today = new Date().toISOString().split("T")[0];
    const fullDoc = {
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
      comprobante: photoUrl || "",
    };

    setDocs((prev) => [
      ...prev,
      {
        id: nextId(),
        photoUrl,
        draft: draftFromItem(fullDoc as any),
        selected: true,
        origen,
      },
    ]);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    
    const compressedBlob = await compressImage(file, 1200);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Url = e.target?.result as string;
      setCurrentPhoto({ url: base64Url, file });
      setReviewModalOpen(true);
    };
    reader.readAsDataURL(compressedBlob);

    if (cameraRef.current) cameraRef.current.value = "";
  }

  function confirmPhoto() {
    if (currentPhoto) {
      addScannedDoc({}, "manual", currentPhoto.url);
      setReviewModalOpen(false);
      setCurrentPhoto(null);
    }
  }

  async function saveAll() {
    setBusy(true);
    try {
      for (const doc of selected) {
        const itemPayload = {
          ...doc.draft,
          sitio: doc.photoUrl ? "[FOTO ADJUNTA]" : "",
        };
        
        await api<SheetData>("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item: itemPayload }),
        });
      }
      onClose();
    } catch (err) {
      setError("Error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-6">
      
      {reviewModalOpen && currentPhoto && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black p-4 sm:p-10">
          <div className="relative w-full max-w-2xl h-full flex flex-col items-center justify-center space-y-6">
            <h3 className="text-white text-xl font-bold">Revisar Fotografía</h3>
            <div className="flex-1 w-full overflow-hidden rounded-2xl bg-slate-800 flex items-center justify-center">
              <img src={currentPhoto.url} className="max-h-full max-w-full object-contain" alt="Vista previa" />
            </div>
            <div className="flex w-full gap-4">
              <button 
                onClick={() => { setReviewModalOpen(false); setCurrentPhoto(null); }} 
                className="flex-1 bg-white/10 text-white py-4 rounded-2xl font-semibold border border-white/20"
              >
                Descartar
              </button>
              <button 
                onClick={confirmPhoto} 
                className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-500/30"
              >
                Aceptar Foto
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-3xl bg-slate-50 sm:rounded-3xl shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:rounded-t-3xl">
          <div>
            <h2 className="text-base font-semibold">Captura de Gastos</h2>
            <p className="text-xs text-slate-500">Selecciona el método de captura</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

          {liveScanner ? (
            <div className="relative rounded-2xl bg-black aspect-video flex flex-col items-center justify-center overflow-hidden">
              <video ref={videoRef} playsInline className="h-full w-full object-cover" />
              <button onClick={() => setLiveScanner(false)} className="absolute bottom-4 bg-white/25 backdrop-blur-md px-6 py-2 rounded-full text-white text-xs font-bold">Cerrar Escáner</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => cameraRef.current?.click()} 
                className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-300 rounded-3xl hover:bg-white transition-all group"
              >
                <div className="p-4 bg-emerald-50 rounded-2xl group-hover:bg-emerald-100 transition-colors text-2xl">📸</div>
                <span className="text-sm font-bold text-slate-700">Tomar Foto</span>
              </button>
              <button 
                onClick={() => setLiveScanner(true)} 
                className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-300 rounded-3xl hover:bg-white transition-all group"
              >
                <div className="p-4 bg-emerald-50 rounded-2xl group-hover:bg-emerald-100 transition-colors text-2xl">📱</div>
                <span className="text-sm font-bold text-slate-700">Escanear QR</span>
              </button>
            </div>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />

          {docs.length > 0 && (
            <div className="space-y-4 pt-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gastos en Lista ({docs.length})</h3>
              {docs.map((doc) => (
                <div key={doc.id} className="p-5 bg-white rounded-2xl shadow-sm border border-slate-200 space-y-4">
                  {doc.photoUrl && (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <img src={doc.photoUrl} className="w-12 h-12 object-cover rounded-lg" alt="Miniatura" />
                      <span className="text-xs font-bold text-emerald-800">✓ Fotografía adjunta lista para guardar</span>
                    </div>
                  )}
                  <ItemFields value={doc.draft} onChange={(k, v) => setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, draft: { ...d.draft, [k]: v } } : d))} />
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="p-5 border-t bg-white sm:rounded-b-3xl">
          <button 
            disabled={!selected.length || busy} 
            onClick={saveAll} 
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-xl disabled:opacity-50 transition-opacity"
          >
            {busy ? "Procesando..." : `Guardar ${selected.length} Gasto(s)`} 
          </button>
        </footer>
      </div>
    </div>
  );
}
