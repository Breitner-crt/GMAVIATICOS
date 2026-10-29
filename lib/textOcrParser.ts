import type { OcrDocument } from "./types";

/**
 * Limpia y normaliza el texto detectado.
 * Si una línea tiene muchos espacios en blanco, intenta tratarla como columnas.
 */
function preprocessOcrText(rawText: string): string[] {
  const lines = rawText.split(/\n/);
  const processedLines: string[] = [];

  for (let line of lines) {
    // Si la línea tiene un hueco de más de 5 espacios, probablemente son dos columnas
    if (line.match(/\s{5,}/)) {
      const columns = line.split(/\s{5,}/).map(c => c.trim()).filter(c => c.length > 2);
      processedLines.push(...columns);
    } else {
      processedLines.push(line.trim());
    }
  }
  return processedLines.filter(Boolean);
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
  const lines = preprocessOcrText(rawText);
  const fullText = lines.join("\n").toUpperCase();

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

  // 1. EXTRAER NIT EMISOR (Búsqueda agresiva)
  // Buscamos "NIT EMISOR", "NIT", "EMISOR" y tomamos el número que siga
  const nitMatch = fullText.match(/(?:NIT|EMISOR|N\.I\.T\.)[\s.:#-]*([0-9Kk-]{7,12})/);
  if (nitMatch) {
    doc.nit = nitMatch[1].replace(/[^0-9Kk]/gi, "");
  }

  // 2. EXTRAER SERIE Y NÚMERO (Bloque derecho DTE)
  // En DTE la serie suele ser un UUID o un código corto.
  const serieMatch = fullText.match(/(?:SERIE|SER)[\s.:#-]*([A-Z0-9-]{6,30})/);
  if (serieMatch) doc.serie = serieMatch[1].trim();

  const numMatch = fullText.match(/(?:DTE|NUMERO|NO|NÚMERO|DOCUMENTO)[\s.:#-]*([0-9]{6,15})/);
  if (numMatch) doc.numero = numMatch[1].trim();

  // 3. EXTRAER FECHA (Soporte para emisión DTE)
  // Formato: 03-oct-2026 08:29:42
  const dteDateMatch = fullText.match(/\b([0-3]?[0-9])[\/\-.](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*[\/\-.](202[3-9]|20[0-9]{2})\b/);
  if (dteDateMatch) {
    doc.fecha = `${dteDateMatch[3]}-${monthToNumber(dteDateMatch[2])}-${dteDateMatch[1].padStart(2, "0")}`;
  } else {
    const standardDate = fullText.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](202[3-9]|20[0-9]{2})\b/);
    if (standardDate) doc.fecha = `${standardDate[3]}-${standardDate[2].padStart(2, "0")}-${standardDate[1].padStart(2, "0")}`;
  }

  // 4. EXTRAER VALOR TOTAL (Estrategia de Monto Máximo)
  // Buscamos el número más grande al final del documento (típico en facturas)
  const allAmounts = fullText.match(/\b[0-9]{1,6}[.,][0-9]{2}\b/g);
  if (allAmounts) {
    const nums = allAmounts.map(a => parseFloat(a.replace(/,/g, ""))).filter(n => !isNaN(n));
    if (nums.length > 0) {
      // Tomamos el máximo valor encontrado, que suele ser el total bruto
      doc.valor = Math.max(...nums).toFixed(2);
    }
  }

  // 5. IDENTIFICAR PROVEEDOR
  // Buscamos líneas que no tengan etiquetas de factura en las primeras 10 líneas procesadas
  for (let line of lines.slice(0, 10)) {
    const l = line.toUpperCase();
    if (l.length > 5 && 
        !l.match(/FACTURA|DTE|DOCUMENTO|SAT|FEL|NIT|EMISOR|FECHA|SERIE|AUTORIZACION|PAGINA/) &&
        !l.match(/^[0-9.-]+$/)) {
      doc.proveedor = l.replace(/[^A-Z0-9 ]/g, "").trim();
      break;
    }
  }

  // 6. CLASIFICACIÓN DE GASTO
  const isFuel = fullText.includes("GASOLIN") || fullText.includes("DIESEL") || fullText.includes("COMBUSTIBLE") || fullText.includes(" ESTACION ");
  const isHotel = fullText.includes("HOTEL") || fullText.includes("HOSPEDAJE") || fullText.includes("HABITACION") || fullText.includes("TURISMO");
  
  if (isFuel) {
    doc.tipoGasto = "Combustible";
    doc.concepto = "CONSUMO DE COMBUSTIBLE";
    if (fullText.includes("SUPER")) doc.tipoComb = "S";
    else if (fullText.includes("REGULAR")) doc.tipoComb = "R";
    else if (fullText.includes("DIESEL")) doc.tipoComb = "D";
  } else if (isHotel) {
    doc.tipoGasto = "Hospedaje";
    doc.concepto = "HOSPEDAJE / ALOJAMIENTO";
    // Extraer INGUAT si existe (suele ser el 10% del total o un valor específico)
    const ingMatch = fullText.match(/(?:INGUAT|TURISMO)[\s.:$Q]*([0-9]+[.,][0-9]{2})/);
    if (ingMatch) doc.inguat = parseFloat(ingMatch[1]).toFixed(2);
  } else {
    doc.tipoGasto = "Viáticos";
    doc.concepto = "ALIMENTACIÓN / CONSUMO";
  }

  return doc;
}
