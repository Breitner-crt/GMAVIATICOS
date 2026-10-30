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
    // Conectando al servidor local de EasyOCR en tu computadora (http://localhost:8000)
    const response = await fetch("http://localhost:8000/ocr", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Error en servidor EasyOCR: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.fullText || "";
    const doc = parseGuatemalaInvoiceText(text);

    return { doc, text };
  } catch (err) {
    console.error("Fallo al conectar con EasyOCR local:", err);
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
      text: "Error: No se pudo conectar a EasyOCR local (http://localhost:8000). Asegúrate de que 'python main.py' esté corriendo.",
    };
  }
}
