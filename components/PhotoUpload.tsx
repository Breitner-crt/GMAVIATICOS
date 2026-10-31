"use client";

import { useRef, useState } from "react";
import { api, compressImage } from "@/lib/client";

export type UploadedPhoto = { id: string; name: string; url: string };

type Props = {
  onClose: () => void;
  onUploaded?: (photo: UploadedPhoto) => void;
};

type Stage = "idle" | "review" | "uploading" | "done";

/**
 * Módulo de fotos totalmente independiente del formulario.
 * Flujo: tomar/elegir foto → revisar → "Guardar foto en Drive" (sube al instante).
 * No crea ni modifica gastos.
 */
export default function PhotoUpload({ onClose, onUploaded }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<UploadedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleFile(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    setError(null);
    setCopied(false);
    try {
      const compressed = await compressImage(file, 1400);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("No se pudo leer la fotografía."));
        reader.readAsDataURL(compressed);
      });
      setPreview(dataUrl);
      setPhotoBase64(dataUrl);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la fotografía.");
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  async function savePhoto() {
    if (!photoBase64) return;
    setStage("uploading");
    setError(null);
    try {
      const photo = await api<UploadedPhoto>("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoBase64,
          filename: reference.trim() || undefined,
        }),
      });
      setResult(photo);
      setStage("done");
      onUploaded?.(photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la fotografía.");
      setStage("review");
    }
  }

  function reset() {
    setStage("idle");
    setPreview(null);
    setPhotoBase64(null);
    setReference("");
    setResult(null);
    setError(null);
    setCopied(false);
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("No se pudo copiar. Mantén presionado el enlace para copiarlo.");
    }
  }

  const busy = stage === "uploading";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white">
      <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 pt-safe pb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
            Módulo de fotos
          </p>
          <h2 className="truncate text-base font-semibold">Subir fotografía a Drive</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-white/70 transition hover:bg-white/10"
          aria-label="Cerrar"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 pb-safe">
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {stage === "idle" && (
          <div className="flex h-full flex-col justify-center gap-4">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-3 rounded-3xl border border-white/15 bg-white/5 px-6 py-10 transition hover:bg-white/10"
            >
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-300">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6h6.6l1 1.6h1.2A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9Z" />
                  <circle cx="12" cy="13" r="3.4" />
                </svg>
              </span>
              <span className="text-base font-semibold">Tomar foto</span>
              <span className="text-xs text-white/60">Se abre la cámara del teléfono</span>
            </button>

            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 py-3.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m4 16 4.5-4.5 3 3L15 11l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Elegir de la galería
            </button>

            <p className="mt-2 text-center text-xs leading-relaxed text-white/50">
              Esta pantalla es solo para fotos: la imagen se guarda directo en tu carpeta de
              Google Drive y no llena ni modifica el formulario.
            </p>
          </div>
        )}

        {(stage === "review" || stage === "uploading") && preview && (
          <div className="flex h-full flex-col gap-4">
            <div className="flex-1 overflow-hidden rounded-2xl bg-black/60">
              <img src={preview} alt="Vista previa" className="h-full w-full object-contain" />
            </div>

            <div>
              <label
                htmlFor="photo-reference"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-white/50"
              >
                Nombre del archivo (opcional)
              </label>
              <input
                id="photo-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="factura-combustible"
                disabled={busy}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-emerald-400 focus:outline-none disabled:opacity-60"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="flex-1 rounded-2xl border border-white/15 px-4 py-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={savePhoto}
                disabled={busy}
                className="flex-[1.5] rounded-2xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 disabled:opacity-60"
              >
                {busy ? "Subiendo a Drive…" : "Guardar foto en Drive"}
              </button>
            </div>
          </div>
        )}

        {stage === "done" && result && (
          <div className="flex h-full flex-col justify-center gap-5">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <p className="text-base font-semibold">Foto guardada en Google Drive</p>
                <p className="mt-1 break-all text-xs text-white/60">{result.name}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                Enlace
              </p>
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-xs text-sky-300 underline decoration-sky-500/40"
              >
                {result.url}
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={copyLink}
                className="rounded-2xl border border-white/15 px-4 py-3.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
              >
                {copied ? "¡Copiado!" : "Copiar enlace"}
              </button>
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-white/15 px-4 py-3.5 text-center text-sm font-semibold text-white/90 transition hover:bg-white/10"
              >
                Abrir en Drive
              </a>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded-2xl bg-white/10 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Subir otra foto
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-slate-900 transition hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => handleFile(event.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleFile(event.target.files)}
      />
    </div>
  );
}
