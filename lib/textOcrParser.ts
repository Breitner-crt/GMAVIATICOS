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
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const fullText = text.toUpperCase();

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

  // 1. NIT (Búsqueda más flexible)
  const nitMatch = fullText.match(/(?:NIT|EMISOR|N\.I\.T\.)[\s.:#-]*([0-9Kk-]{7,12})/i);
  if (nitMatch) {
    doc.nit = nitMatch[1].replace(/[^0-9Kk]/gi, "");
  }

  // 2. Serie y Número
  const serieMatch = fullText.match(/(?:SERIE|SER)[\s.:#-]*([A-Z0-9-]{1,20})/);
  if (serieMatch) doc.serie = serieMatch[1].trim();

  const numMatch = fullText.match(/(?:DTE|FACTURA|NUMERO|NO|NÚMERO)[\s.:#-]*([0-9]{3,15})/);
  if (numMatch) doc.numero = numMatch[1].trim();

  // 3. Fecha con soporte para meses en español
  const alphaDate = fullText.match(/\b([0-3]?[0-9])[\/\-.](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*[\/\-.](202[3-9]|20[0-9]{2})\b/);
  if (alphaDate) {
    doc.fecha = `${alphaDate[3]}-${monthToNumber(alphaDate[2])}-${alphaDate[1].padStart(2, "0")}`;
  } else {
    const dateMatch = fullText.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](202[3-9]|20[0-9]{2})\b/);
    if (dateMatch) doc.fecha = `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
  }

  // 4. Búsqueda Inteligente de Monto (Total)
  let foundTotal = false;
  const totalRegexes = [
    /(?:TOTAL|TOT|VALOR|SUMA|PAGAR|PAGO)(?:\s*\(Q\))?[\s.:$Q]*([0-9]{1,6}(?:[,.][0-9]{2,3})*(?:[.,][0-9]{2}))/i,
    /(?:Q\.?|GTQ)[\s]*([0-9]{1,6}(?:[,.][0-9]{2,3})*(?:[.,][0-9]{2}))/i
  ];

  for (const regex of totalRegexes) {
    const m = fullText.match(regex);
    if (m && m[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0) {
        doc.valor = val.toFixed(2);
        foundTotal = true;
        break;
      }
    }
  }

  // FALLBACK: Si no hay palabra "TOTAL", buscar el número más grande de la factura
  if (!foundTotal || doc.valor === "0") {
    const allAmounts = fullText.match(/\b[0-9]{1,6}[.,][0-9]{2}\b/g);
    if (allAmounts) {
      const nums = allAmounts.map(a => parseFloat(a.replace(/,/g, ""))).filter(n => !isNaN(n));
      if (nums.length > 0) {
        doc.valor = Math.max(...nums).toFixed(2);
      }
    }
  }

  // 5. Proveedor (Limpiar basura de autorización)
  for (const line of lines.slice(0, 5)) {
    const l = line.toUpperCase();
    if (l.length > 4 && !l.match(/FACTURA|DTE|DOCUMENTO|SAT|FEL|NIT|EMISOR|FECHA/)) {
      // Quitar "NÚMERO DE AUTORIZACIÓN" o textos largos de FEL del nombre
      doc.proveedor = line.split(/(?:N[ÚU]MERO|AUTORIZACION|SERIE|NIT)/i)[0].trim().toUpperCase();
      break;
    }
  }

  // 6. Concepto y Tipo de Gasto
  const isFuel = fullText.includes("GASOLIN") || fullText.includes("DIESEL") || fullText.includes("COMBUSTIBLE");
  const isHotel = fullText.includes("HOTEL") || fullText.includes("HOSPEDAJE") || fullText.includes("HABITACION");
  
  if (isFuel) {
    doc.tipoGasto = "Combustible";
    doc.concepto = "CONSUMO DE COMBUSTIBLE";
    if (fullText.includes("SUPER")) doc.tipoComb = "S";
    else if (fullText.includes("REGULAR")) doc.tipoComb = "R";
    else if (fullText.includes("DIESEL")) doc.tipoComb = "D";
  } else if (isHotel) {
    doc.tipoGasto = "Hospedaje";
    doc.concepto = "HOSPEDAJE";
    // Extraer INGUAT si existe
    const ingMatch = fullText.match(/(?:INGUAT|TURISMO)[\s.:$Q]*([0-9]+[.,][0-9]{2})/);
    if (ingMatch) doc.inguat = parseFloat(ingMatch[1]).toFixed(2);
  } else {
    doc.tipoGasto = "Viáticos";
    doc.concepto = "ALIMENTACIÓN / CONSUMO";
  }

  return doc;
}
