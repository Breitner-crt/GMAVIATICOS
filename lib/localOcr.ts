import { createWorker, type Worker } from "tesseract.js";
import { parseGuatemalaInvoiceText } from "./textOcrParser";
import type { OcrDocument } from "./types";

let cachedWorker: Worker | null = null;
let initializingPromise: Promise<Worker> | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (cachedWorker) return cachedWorker;
  if (initializingPromise) return initializingPromise;

  initializingPromise = (async () => {
    const worker = await createWorker("spa", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
    });

    cachedWorker = worker;
    return worker;
  })();

  return initializingPromise;
}

/**
 * Filtro de alto contraste para mejorar la lectura de letras pequeñas en el celular.
 */
async function applyEnhancementFilter(imageBlob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(imageBlob);
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      
      ctx.drawImage(img, 0, 0);
      
      // Aplicar filtro de nitidez y alto contraste mediante CSS filter en canvas
      ctx.filter = "grayscale(100%) contrast(250%) brightness(110%)";
      ctx.drawImage(img, 0, 0);

      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob || imageBlob), "image/jpeg", 0.95);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(imageBlob);
    };

    img.src = url;
  });
}

interface OcrResult {
  doc: OcrDocument;
  text: string;
}

/**
 * Ejecuta OCR local en el navegador con Tesseract optimizado.
 */
export async function runLocalOcr(imageBlob: Blob): Promise<OcrResult> {
  const processedBlob = await applyEnhancementFilter(imageBlob);
  
  const worker = await getTesseractWorker();
  const ret = await worker.recognize(processedBlob);
  const text = ret.data.text || "";

  const doc = parseGuatemalaInvoiceText(text);

  return { doc, text };
}
