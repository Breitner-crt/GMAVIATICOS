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
 * Aplica un filtro de binarización avanzado tipo "CamScanner" (Magic Color / B&W).
 * Convierte la imagen en un blanco y negro puro de alto contraste para eliminar sombras y fondos.
 */
async function applyCamScannerFilter(imageBlob: Blob): Promise<Blob> {
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
      
      // Dibujar imagen original
      ctx.drawImage(img, 0, 0);
      
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        
        // Algoritmo de binarización de Otsu / Umbral adaptable simplificado (Estilo CamScanner B&W)
        // Calculamos un promedio de luminosidad local o global para separar texto de fondo
        let totalLuma = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          totalLuma += (r * 0.299 + g * 0.587 + b * 0.114);
        }
        const avgLuma = totalLuma / (data.length / 4);
        // Umbral dinámico con sesgo hacia el blanco para limpiar fondo
        const threshold = Math.max(80, Math.min(200, avgLuma * 0.9));

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          const luma = r * 0.299 + g * 0.587 + b * 0.114;
          
          // Si está por debajo del umbral es texto (Negro), si está por encima es fondo (Blanco)
          const val = luma < threshold ? 0 : 255;
          
          data[i]     = val; // R
          data[i + 1] = val; // G
          data[i + 2] = val; // B
        }

        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Fallback a filtro CSS si falla el acceso a píxeles por CORS o seguridad
        ctx.filter = "grayscale(100%) contrast(300%) brightness(120%)";
        ctx.drawImage(img, 0, 0);
      }

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

/**
 * Ejecuta OCR local en el navegador sobre un Blob aplicando el filtro CamScanner.
 */
interface OcrResult {
  doc: OcrDocument;
  text: string;
}

export async function runLocalOcr(imageBlob: Blob): Promise<OcrResult> {
  // Aplicar filtro de escaneo profesional antes de leer con Tesseract
  const processedBlob = await applyCamScannerFilter(imageBlob);
  
  const worker = await getTesseractWorker();
  const ret = await worker.recognize(processedBlob);
  const text = ret.data.text || "";

  const doc = parseGuatemalaInvoiceText(text);

  return { doc, text };
}
