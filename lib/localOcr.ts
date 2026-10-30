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
    // Conectando al nuevo túnel de Localtunnel que apunta a tu EasyOCR local
    const response = await fetch("https://salty-rabbits-smile.loca.lt/ocr", {
      method: "POST",
      headers: {
        "Bypass-Tunnel-Reminder": "true",
      },
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
    console.error("Fallo al conectar con EasyOCR por Localtunnel:", err);
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
      text: "Error: No se pudo conectar a EasyOCR a través de Localtunnel. Verifica que 'lt --port 8000' y 'python main.py' sigan corriendo.",
    };
  }
}
