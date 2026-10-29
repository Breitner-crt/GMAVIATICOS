import type { Item, OcrDocument } from "./types";
import { createWorker } from "tesseract.js";

export type { OcrDocument };

export function ocrEnabled(): boolean {
  // Tesseract siempre está disponible en el servidor sin requerir claves externas
  return true;
}

export async function extractFromPhoto(
  base64: string,
  mimeType: string
): Promise<OcrDocument[]> {
  try {
    // Inicializar Tesseract optimizado para español e inglés
    const worker = await createWorker("spa");

    // Convertir la imagen base64 a Buffer
    const buffer = Buffer.from(base64, "base64");

    const ret = await worker.recognize(buffer);
    await worker.terminate();

    const text = ret.data.text || "";
    return [parseReceiptText(text)];
  } catch (error) {
    console.error("Error en Tesseract OCR:", error);
    throw new Error("No se pudo leer el texto de la imagen con Tesseract.");
  }
}

function parseReceiptText(text: string): OcrDocument {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fullText = text.toUpperCase();

  // 1. Extraer NIT (ej. NIT: 123456-7)
  let nit = "";
  const nitMatch = fullText.match(/NIT[:\s]*([0-9A-Z-]+)/);
  if (nitMatch) {
    nit = nitMatch[1].replace(/[^0-9Kk]/g, "");
  } else {
    const digitsOnly = fullText.match(/\b\d{6,10}-?[0-9Kk]?\b/);
    if (digitsOnly) nit = digitsOnly[0];
  }

  // 2. Extraer Monto / Valor Total
  let valor = "";
  const totalMatches = fullText.match(/(?:TOTAL|TOT|VALOR|SUMA)[:\s]*Q?\.?\s*([0-9]+[.,][0-9]{2})/g);
  if (totalMatches && totalMatches.length > 0) {
    const lastMatch = totalMatches[totalMatches.length - 1];
    const numMatch = lastMatch.match(/([0-9]+[.,][0-9]{2})/);
    if (numMatch) valor = numMatch[1].replace(",", ".");
  }

  if (!valor) {
    const amounts = fullText.match(/\b[0-9]{1,4}[.,][0-9]{2}\b/g);
    if (amounts && amounts.length > 0) {
      const nums = amounts.map((a) => Number(a.replace(",", "."))).filter((n) => !isNaN(n));
      if (nums.length > 0) valor = String(Math.max(...nums));
    }
  }

  // 3. Extraer Fecha
  let fecha = "";
  const dateMatch = fullText.match(/\b(20[2-3][0-9])[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12][0-9]|3[01])\b/) ||
                    fullText.match(/\b(0[1-9]|[12][0-9]|3[01])[-/.](0[1-9]|1[0-2])[-/.](20[2-3][0-9])\b/);
  if (dateMatch) {
    if (dateMatch[1].length === 4) {
      fecha = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    } else {
      fecha = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }
  } else {
    fecha = new Date().toISOString().split("T")[0];
  }

  // 4. Extraer Placa
  let placa = "";
  const placaMatch = fullText.match(/\b([P|C|A|U|M]\d{3}[A-Z]{3})\b/) || fullText.match(/PLACA[:\s]*([A-Z0-9-]+)/);
  if (placaMatch) placa = placaMatch[1];

  // 5. Detectar Tipo de Gasto y Combustible
  let tipoGasto = "Otros";
  let tipoComb = "";
  let galones = "";

  if (fullText.includes("SUPER") || fullText.includes("REGULAR") || fullText.includes("DIESEL") || fullText.includes("COMBUSTIBLE") || fullText.includes("GASOLINERA")) {
    tipoGasto = "Combustible";
    if (fullText.includes("SUPER") || fullText.includes("SUP")) tipoComb = "S";
    else if (fullText.includes("DIESEL") || fullText.includes("DIES")) tipoComb = "D";
    else tipoComb = "R";

    const galMatch = fullText.match(/([0-9]+[.,][0-9]{1,3})\s*(?:GAL|GLS|GALONES)/);
    if (galMatch) galones = galMatch[1].replace(",", ".");
  } else if (fullText.includes("HOTEL") || fullText.includes("HOSPEDAJE")) {
    tipoGasto = "Hospedaje";
  } else if (fullText.includes("RESTAURANTE") || fullText.includes("COMIDA") || fullText.includes("ALIMENTACION")) {
    tipoGasto = "Viáticos";
  }

  let proveedor = lines[0] || "ESTABLECIMIENTO";
  if (proveedor.length < 3 && lines[1]) proveedor = lines[1];

  let concepto = tipoGasto === "Combustible" ? `CONSUMO DE COMBUSTIBLE (${tipoComb === "S" ? "SÚPER" : tipoComb === "D" ? "DIÉSEL" : "REGULAR"})` : `${tipoGasto.toUpperCase()} VARIOS`;

  return {
    proveedor: proveedor.toUpperCase(),
    nit: nit.replace(/[^0-9Kk-]/g, ""),
    tipoDoc: "FAC",
    serie: "",
    numero: "",
    fecha,
    placa: placa.toUpperCase(),
    concepto,
    tipoGasto,
    valor,
    galones,
    tipoComb,
    inguat: "",
    pais: "GUATEMALA",
    sitio: "",
    confianza: "media",
  };
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
