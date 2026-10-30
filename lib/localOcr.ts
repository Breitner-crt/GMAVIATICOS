import type { OcrDocument } from "./types";

interface OcrResult {
  doc: OcrDocument;
  text: string;
}

export async function runLocalOcr(imageBlob: Blob): Promise<OcrResult> {
  const formData = new FormData();
  formData.append("file", imageBlob, "invoice.jpg");

  try {
    const response = await fetch("/api/ocr", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error en servidor OCR: ${response.statusText}`);
    }

    const doc: OcrDocument = await response.json();
    return { doc, text: "Procesado con éxito mediante Google Cloud Document AI (Invoice Parser)." };
  } catch (err) {
    console.error("Fallo al conectar con Google Document AI:", err);
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
      text: err instanceof Error ? err.message : "Error al procesar la factura con Google Cloud Document AI.",
    };
  }
}
