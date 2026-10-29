import type { OcrDocument } from "./types";
import { parseGuatemalaInvoiceText } from "./textOcrParser";

interface OcrResult {
  doc: OcrDocument;
  text: string;
}

export async function runLocalOcr(imageBlob: Blob): Promise<OcrResult> {
  const formData = new FormData();
  formData.append("file", imageBlob, "invoice.jpg");

  try {
    // Conectando al microservicio PaddleOCR en Hugging Face Space
    const response = await fetch("https://nistal-gt-invoice-ocr.hf.space/ocr", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Error en servidor OCR: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.fullText || "";
    const doc = parseGuatemalaInvoiceText(text);

    return { doc, text };
  } catch (err) {
    console.error("Fallo al conectar con PaddleOCR Space:", err);
    // Fallback de emergencia si el Space está durmiendo o cargando
    const fallbackDoc: OcrDocument = {
      proveedor: "ESTABLECIMIENTO",
      nit: "",
      tipoDoc: "FAC",
      serie: "",
      numero: "",
      fecha: new Date().toISOString().split("T")[0],
      placa: "",
      concepto: "CONSUMO GENERAL",
      tipoGasto: "Viáticos",
      valor: "0",
      galones: "",
      tipoComb: "",
      inguat: "",
      pais: "GUATEMALA",
      sitio: "",
      confianza: "baja",
    };
    return {
      doc: fallbackDoc,
      text: "Error: No se pudo conectar al motor OCR de Hugging Face. Verifica que el Space esté activo.",
    };
  }
}
