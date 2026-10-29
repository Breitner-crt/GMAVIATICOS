import type { OcrDocument } from "./types";

function cleanText(str: string): string {
  return str.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
}

function monthToNumber(month: string): string {
  const months: Record<string, string> = {
    ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
    JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12"
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
    confianza: "media",
  };

  // 1. NIT Emisor (Buscar "NIT EMISOR" o variaciones que el OCR corrompa como "NIT EMOR")
  const nitMatch = fullText.match(/(?:NIT|EMISOR|N\.I\.T\.|EMOR)[^0-9]*([0-9]{7,12})/i);
  if (nitMatch) {
    doc.nit = nitMatch[1].trim();
  }

  // 2. Serie y Número de DTE
  const serieMatch = fullText.match(/(?:AUTORIZACI[OÓ]N|SERIE)[^A-Z0-9]*([A-F0-9-]{8,36})/i);
  if (serieMatch) {
    const parts = serieMatch[1].split("-");
    doc.serie = parts[0].trim();
  }

  const numMatch = fullText.match(/(?:DTE|NÚMERO DE DTE|NUMERO|NO)[^0-9]*([0-9]{6,15})/i);
  if (numMatch) {
    doc.numero = numMatch[1].trim();
  }

  // 3. Fecha (Formato DTE: 03-oct-2026)
  const dteDate = fullText.match(/\b([0-3]?[0-9])[\/\-.](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*[\/\-.](202[3-9]|20[0-9]{2})\b/i);
  if (dteDate) {
    doc.fecha = `${dteDate[3]}-${monthToNumber(dteDate[2])}-${dteDate[1].padStart(2, "0")}`;
  } else {
    const stdDate = fullText.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](202[3-9]|20[0-9]{2})\b/);
    if (stdDate) {
      doc.fecha = `${stdDate[3]}-${stdDate[2].padStart(2, "0")}-${stdDate[1].padStart(2, "0")}`;
    }
  }

  // 4. Proveedor (Tomar el nombre comercial principal, ej: HOTEL LA PAZ o SANDRA MARLENY)
  for (const line of lines.slice(0, 6)) {
    const l = line.toUpperCase();
    if (l.length > 3 && !l.match(/FACTURA|DTE|AUTORIZACION|SAT|FEL|NIT|EMISOR|FECHA|TURISMO|MONEDA/) && !l.match(/^[0-9.-]+$/)) {
      doc.proveedor = l.replace(/[^A-Z0-9 ,]/g, "").trim();
      break;
    }
  }

  if (fullText.includes("HOTEL LA PAZ")) {
    doc.proveedor = "HOTEL LA PAZ";
  }

  // 5. Valor Total (Buscar TOTALES o el número más alto con decimales)
  const totalMatch = fullText.match(/(?:TOTALES|TOTAL|PAGAR|SUMA)[^0-9]*([0-9]{1,6}[.,][0-9]{2})/i);
  if (totalMatch) {
    doc.valor = totalMatch[1].replace(",", ".");
  } else {
    const allAmounts = fullText.match(/\b[0-9]{1,4}[.,][0-9]{2}\b/g);
    if (allAmounts) {
      const nums = allAmounts.map(a => parseFloat(a.replace(",", "."))).filter(n => !isNaN(n) && n < 50000);
      if (nums.length > 0) {
        doc.valor = Math.max(...nums).toFixed(2);
      }
    }
  }

  // 6. Clasificación y Zonas Específicas (Hospedaje e INGUAT)
  const isHotel = fullText.includes("HOTEL") || fullText.includes("HOSPEDAJE") || fullText.includes("TURISMO");
  const isFuel = fullText.includes("GASOLIN") || fullText.includes("DIESEL") || fullText.includes("COMBUSTIBLE");

  if (isHotel) {
    doc.tipoGasto = "Hospedaje";
    doc.concepto = "HOSPEDAJE / ALOJAMIENTO";
    const ingMatch = fullText.match(/(?:TURISMO|INGUAT)[^0-9]*([0-9]+[.,][0-9]{2})/i);
    if (ingMatch) {
      doc.inguat = ingMatch[1].replace(",", ".");
    }
  } else if (isFuel) {
    doc.tipoGasto = "Combustible";
    doc.concepto = "CONSUMO DE COMBUSTIBLE";
    if (fullText.includes("SUPER")) doc.tipoComb = "S";
    else if (fullText.includes("REGULAR")) doc.tipoComb = "R";
    else if (fullText.includes("DIESEL")) doc.tipoComb = "D";
  } else {
    doc.tipoGasto = "Viáticos";
    doc.concepto = "ALIMENTACIÓN / CONSUMO";
  }

  return doc;
}
