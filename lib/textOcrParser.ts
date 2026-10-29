import type { OcrDocument } from "./types";

/**
 * Normaliza y limpia cadenas de texto de OCR
 */
function cleanText(str: string): string {
  return str.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
}

/**
 * Convierte nombres de mes en español a número
 */
function monthToNumber(month: string): string {
  const months: Record<string, string> = {
    ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
    JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12"
  };
  const key = month.toUpperCase().slice(0, 3);
  return months[key] || "01";
}

/**
 * Parsea el texto crudo extraído por Tesseract buscando patrones comunes
 * de facturas emitidas en Guatemala (DTE / FEL, estaciones de servicio, restaurantes, etc.).
 */
export function parseGuatemalaInvoiceText(rawText: string): OcrDocument {
  const text = cleanText(rawText);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

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

  // 1. Extraer NIT Emisor (ej: "Nit Emisor: 17629349", "NIT: 1234567-8")
  const nitMatch = text.match(/(?:NIT|N\.I\.T\.|N I T|EMISOR)[\s.:#-]*([0-9]{4,10}[-\s]?[0-9Kk])/i);
  if (nitMatch && nitMatch[1]) {
    const cleanNit = nitMatch[1].replace(/[^0-9Kk]/gi, "");
    if (cleanNit.toUpperCase() !== "CF") {
      doc.nit = cleanNit;
    }
  }

  // 2. Extraer Serie (DTE o Factura común)
  const serieMatch = text.match(/(?:SERIE|NO\.\s*SERIE)[\s.:#-]*([A-Z0-9-]{1,25})/i);
  if (serieMatch && serieMatch[1]) {
    doc.serie = serieMatch[1].toUpperCase();
  }

  // 3. Extraer Número de DTE o Factura
  const numMatch = text.match(/(?:N[ÚU]MERO|NUMERO|DTE|FACTURA\s*(?:NO\.?|#)?)[\s.:#-]*([0-9]{3,15})/i);
  if (numMatch && numMatch[1]) {
    doc.numero = numMatch[1];
  }

  // 4. Extraer Fecha (Formatos: DD/MM/YYYY, DD-OCT-2026, YYYY-MM-DD)
  // DD-MMM-YYYY (ej: 03-oct-2026)
  const alphaDate = text.match(/\b([0-3]?[0-9])[\/\-.](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*[\/\-.](202[3-9]|20[0-9]{2})\b/i);
  if (alphaDate) {
    const day = alphaDate[1].padStart(2, "0");
    const month = monthToNumber(alphaDate[2]);
    const year = alphaDate[3];
    doc.fecha = `${year}-${month}-${day}`;
  } else {
    const dateMatch = text.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](202[3-9]|20[0-9]{2})\b/);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, "0");
      const month = dateMatch[2].padStart(2, "0");
      const year = dateMatch[3];
      doc.fecha = `${year}-${month}-${day}`;
    }
  }

  // 5. Extraer Monto Total
  const totalRegexes = [
    /(?:TOTAL|TOT|VALOR|SUMA)(?:\s*\(Q\))?[\s.:$Q]*([0-9]{1,6}(?:[,.][0-9]{2,3})*(?:[.,][0-9]{2}))/i,
    /(?:Q\.?|GTQ)[\s]*([0-9]{1,6}(?:[,.][0-9]{2,3})*(?:[.,][0-9]{2}))/i,
    /\bTOTAL[\s.:$Q]*([0-9]+[.,][0-9]{2})\b/i,
  ];

  for (const regex of totalRegexes) {
    const totalMatch = text.match(regex);
    if (totalMatch && totalMatch[1]) {
      let valStr = totalMatch[1].replace(/,/g, ""); // Quitar comas de miles
      const numVal = parseFloat(valStr);
      if (!isNaN(numVal) && numVal > 0) {
        doc.valor = numVal.toFixed(2);
        break;
      }
    }
  }

  // 6. Extraer INGUAT (Turismo Hospedaje)
  const inguatMatch = text.match(/(?:TURISMO|INGUAT|IMPUESTO\s*TURISMO)[\s.:$Q]*([0-9]{1,6}(?:[,.][0-9]{2,3})*(?:[.,][0-9]{2,6}))/i);
  if (inguatMatch && inguatMatch[1]) {
    const iVal = parseFloat(inguatMatch[1].replace(/,/g, ""));
    if (!isNaN(iVal)) doc.inguat = iVal.toFixed(2);
  }

  // 7. Clasificación de Tipo de Gasto
  const lowerText = text.toLowerCase();
  const isFuel = lowerText.includes("gasolin") || lowerText.includes("diesel") || lowerText.includes("combustible") || lowerText.includes("shell") || lowerText.includes("puma") || lowerText.includes("texaco");
  const isHotel = lowerText.includes("hotel") || lowerText.includes("hospedaje") || lowerText.includes("posada");

  if (isFuel) {
    doc.tipoGasto = "Combustible";
    doc.concepto = "CONSUMO DE COMBUSTIBLE";
    if (lowerText.includes("superior")) doc.tipoComb = "S";
    else if (lowerText.includes("regular")) doc.tipoComb = "R";
    else if (lowerText.includes("diesel")) doc.tipoComb = "D";

    const galMatch = text.match(/(?:GALONES|GALS?|CANTIDAD)[\s.:]*([0-9]+[.,][0-9]{1,3})/i);
    if (galMatch) doc.galones = galMatch[1].replace(/,/g, ".");
  } else if (isHotel) {
    doc.tipoGasto = "Hospedaje";
    doc.concepto = "HOSPEDAJE";
  } else {
    doc.tipoGasto = "Viáticos";
    doc.concepto = "ALIMENTACIÓN / CONSUMO";
  }

  // Intentar mejorar concepto desde la descripción
  const descMatch = text.match(/(?:DESCRIPCION|POR)[\s.:-]*([A-Z\s]{4,30})/i);
  if (descMatch && descMatch[1]) {
    doc.concepto = descMatch[1].trim().toUpperCase();
  }

  // 8. Estimación del Nombre del Proveedor
  // Buscar nombres específicos de cadenas o palabras clave
  const suppliers = ["HOTEL", "RESTAURANTE", "GASOLINERA", "TIENDA", "COMERCIAL"];
  let foundProv = "";
  
  for (const line of lines.slice(0, 8)) {
    const l = line.toUpperCase();
    if (suppliers.some(s => l.includes(s)) && !l.includes("FACTURA") && !l.includes("NIT")) {
      foundProv = l;
      break;
    }
  }

  if (foundProv) {
    doc.proveedor = foundProv;
  } else {
    // Fallback al primer texto coherente
    for (const line of lines.slice(0, 5)) {
      if (line.length > 5 && !line.match(/factura|dte|documento|sat|fel|original|nit|emisor/i)) {
        doc.proveedor = line.toUpperCase();
        break;
      }
    }
  }

  return doc;
}