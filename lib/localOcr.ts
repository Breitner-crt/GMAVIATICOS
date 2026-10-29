import { createWorker, type Worker } from "tesseract.js";
import { parseGuatemalaInvoiceText } from "./textOcrParser";
import type { OcrDocument } from "./types";

let cachedWorker: Worker | null = null;
let initializingPromise: Promise<Worker> | null = null;

/**
 * Inicializa y reutiliza el worker local de Tesseract con modelos ligeros (fast)
 * en español e inglés sin depender de llamadas a IA externas.
 */
async function getTesseractWorker(): Promise<Worker> {
  if (cachedWorker) return cachedWorker;
  if (initializingPromise) return initializingPromise;

  initializingPromise = (async () => {
    // Usamos las fuentes CDN oficiales y el modelo fast (~1.1 MB para español)
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
 * Ejecuta OCR local en el navegador del usuario sobre un Blob de imagen
 * y extrae los campos clave usando expresiones regulares de facturación GT.
 */
export async function runLocalOcr(imageBlob: Blob): Promise<OcrDocument> {
  const worker = await getTesseractWorker();
  const ret = await worker.recognize(imageBlob);
  const text = ret.data.text || "";

  return parseGuatemalaInvoiceText(text);
}
