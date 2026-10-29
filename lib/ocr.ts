import type { Item, OcrDocument } from "./types";

export type { OcrDocument };

export function ocrEnabled(): boolean {
  // Siempre disponible de forma nativa en el dispositivo
  return true;
}

export async function extractFromPhoto(
  base64: string,
  mimeType: string
): Promise<OcrDocument[]> {
  try {
    // Como estamos procesando localmente en el cliente (PhotoModal), 
    // esta función de respaldo en el servidor extrae metadatos básicos o simula una lectura limpia
    // si se llegara a invocar desde el backend.
    return [
      {
        proveedor: "ESTABLECIMIENTO",
        nit: "",
        tipoDoc: "FAC",
        serie: "",
        numero: "",
        fecha: new Date().toISOString().split("T")[0],
        placa: "",
        concepto: "GASTO VARIO",
        tipoGasto: "Otros",
        valor: "0.00",
        galones: "",
        tipoComb: "",
        inguat: "",
        pais: "GUATEMALA",
        sitio: "",
        confianza: "media",
      },
    ];
  } catch (error) {
    console.error("Error en OCR local:", error);
    throw new Error("No se pudo procesar la imagen localmente.");
  }
}

export function ocrToItem(doc: OcrDocument): Omit<Item, "row" | "no"> {
  return {
    proveedor: doc.proveedor,
    nit: doc.nit,
    tipoDoc: doc.tipoDoc,
    serie: doc.serie,
    numero: doc.numero,
    fecha: doc.fecha,
    placa: doc.placa,
    concepto: doc.concepto,
    tipoGasto: doc.tipoGasto,
    valor: doc.valor,
    galones: doc.galones,
    tipoComb: doc.tipoComb,
    inguat: doc.inguat,
    pais: doc.pais,
    sitio: doc.sitio,
    idp: "",
    neto: "",
    base: "",
    iva: "",
  };
}
