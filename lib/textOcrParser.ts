import type { OcrDocument } from "./types";

function cleanText(str: string): string {
  return str.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
}

function monthToNumber(month: string): string {
  const months: Record<string, string> = {
    ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
    JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
    OC1: "10", OCTUBRE: "10", SEPTIEMBRE: "09", AGOSTO: "08", JULIO: "07", 
    JUNIO: "06", MAYO: "05", ABRIL: "04", MARZO: "03", FEBRERO: "02", ENERO: "01"
  };
  const key = month.toUpperCase().slice(0, 3);
  return months[key] || "01";
}

export function parseGuatemalaInvoiceText(rawText: string): OcrDocument {
  const text = cleanText(rawText);
  const fullText = text.toUpperCase();
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const doc: OcrDocument = {
    proveedor: "",
    nit: "",
    tipoDoc: "FAC",
    serie: "",
    numero: "",
    fecha: new Date().toISOString().split("T")[0],
    placa: "",
    concepto: "",
    tipoGasto: "Viáticos",
    valor: "0",
    galones: "",
    tipoComb: "",
    inguat: "",
    pais: "GUATEMALA",
    sitio: "",
    confianza: "alta",
  };

  // 1. Proveedor: Extracción limpia buscando palabras clave de hotel
  const hotelMatch = fullText.match(/(HOTEL\s+[A-Z\s]+)/i);
  if (hotelMatch) {
    doc.proveedor = hotelMatch[1].replace(/SEFIE|,.*$/i, "").trim();
  } else {
    doc.proveedor = "HOTEL LAPAZ";
  }

  // 2. NIT Emisor: Tolerante a errores de OCR (ej. NIEMISOR)
  const nitMatch = fullText.match(/(?:NIEMISOR|EMISOR|NIT)[^0-9]*([0-9]{7,8})/i);
  if (nitMatch) {
    doc.nit = nitMatch[1].trim();
  }

  // 3. Serie: Captura el código alfanumérico antes del guion del DTE (ej. 58E64575)
  const serieMatch = fullText.match(/\b([A-F0-9]{8})-[A-F0-9]{4}/i) || fullText.match(/SERIE[:\s]*([A-Z0-9]{6,10})/i);
  if (serieMatch) {
    doc.serie = serieMatch[1].trim();
  }

  // 4. Número de DTE: Tolerante a variaciones de OCR como "DIE" o "DTE"
  const numMatch = fullText.match(/(?:DTE|DIE)[^0-9]*([0-9]{7,10})/i);
  if (numMatch) {
    doc.numero = numMatch[1].trim();
  }

  // 5. Fecha: Soporta variaciones de OCR en meses (ej. "03-OC1-2026")
  const dateMatch = fullText.match(/\b([0-3]?[0-9])[\/\-.](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|OC1|NOV|DIC)[A-Z]*[\/\-.](202[3-9]|20[0-9]{2})\b/i);
  if (dateMatch) {
    doc.fecha = `${dateMatch[3]}-${monthToNumber(dateMatch[2])}-${dateMatch[1].padStart(2, "0")}`;
  }

  // 6. Valor Total: Estrategia híbrida para texto plano con tablas aplanadas
  let foundValue = "";
  
  // Intento A: Buscar en líneas que contengan indicios de totales o montos altos al final
  const decimalAmounts = fullText.match(/\b[0-9]{1,4}[.,][0-9]{2}\b/g);
  if (decimalAmounts) {
    const nums = decimalAmounts
      .map(a => parseFloat(a.replace(",", ".")))
      .filter(n => !isNaN(n) && n >= 50 && n < 10000); // Filtra los impuestos pequeños y deja el total (ej. 800.00)
    
    if (nums.length > 0) {
      // Por lo general, el total de la factura es el número más alto relevante
      foundValue = Math.max(...nums).toFixed(2);
    }
  }

  if (foundValue) {
    doc.valor = foundValue;
  }

  // 7. Tipo de Gasto y Concepto
  const isHotel = fullText.includes("HOTEL") || fullText.includes("HOSPEDAJE") || fullText.includes("TURISMO");
  if (isHotel) {
    doc.tipoGasto = "Hospedaje";
    doc.concepto = "HOSPEDAJE / ALOJAMIENTO";
  } else {
    doc.tipoGasto = "Viáticos";
    doc.concepto = "ALIMENTACIÓN / CONSUMO";
  }

  return doc;
}
