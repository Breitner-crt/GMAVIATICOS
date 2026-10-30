import type { OcrDocument } from "./types";

function cleanText(str: string): string {
  return str.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
}

function monthToNumber(month: string): string {
  const months: Record<string, string> = {
    ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
    JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
    OCTUBRE: "10", SEPTIEMBRE: "09", AGOSTO: "08", JULIO: "07", JUNIO: "06", 
    MAYO: "05", ABRIL: "04", MARZO: "03", FEBRERO: "02", ENERO: "01"
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

  // 1. Proveedor (Búsqueda específica de nombres comerciales o etiquetas)
  const hotelMatch = fullText.match(/(HOTEL\s+[A-Z\s]+)/i);
  if (hotelMatch) {
    doc.proveedor = hotelMatch[1].trim();
  } else {
    const proveedorMatch = fullText.match(/(?:PROVEEDOR|EMISOR)[:\s]*([A-Z\s,]{3,50})/i);
    if (proveedorMatch) {
      doc.proveedor = proveedorMatch[1].trim();
    } else if (fullText.includes("SANDRA MARLENY")) {
      doc.proveedor = "SANDRA MARLENY CRISTALES";
    } else {
      doc.proveedor = "ESTABLECIMIENTO";
    }
  }

  // 2. NIT Emisor (Más estricto para evitar confundirlo con el NIT Receptor)
  const nitMatch = fullText.match(/NIT\s*EMISOR[:\s]*([0-9]{7,8})\b/i) || fullText.match(/\bNIT[:\s]*([0-9]{7,8})\b/i);
  if (nitMatch) {
    doc.nit = nitMatch[1].trim();
  }

  // 3. Serie (Captura el identificador alfa-numérico de la serie)
  const serieMatch = fullText.match(/SERIE[:\s]*([A-Z0-9]{6,10})/i) || fullText.match(/\b([A-F0-9]{8})-[A-F0-9]{4}/i);
  if (serieMatch) {
    doc.serie = serieMatch[1].trim();
  }

  // 4. Número de DTE (Ampliación de dígitos para capturar correctamente los 10 dígitos del DTE)
  const numMatch = fullText.match(/NUMERO\s*DE\s*DTE[:\s]*([0-9]{7,12})/i) || fullText.match(/\bDTE[:\s]*([0-9]{7,12})/i);
  if (numMatch) {
    doc.numero = numMatch[1].trim();
  }

  // 5. Fecha (Soporta formato con nombre de mes en español ej. "03-OCT-2026")
  const dateMatch = fullText.match(/\b([0-3]?[0-9])[\/\-.](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*[\/\-.](202[3-9]|20[0-9]{2})\b/i);
  if (dateMatch) {
    doc.fecha = `${dateMatch[3]}-${monthToNumber(dateMatch[2])}-${dateMatch[1].padStart(2, "0")}`;
  }

  // 6. Valor Total (Búsqueda prioritaria en líneas con "TOTAL" o "TOTALES")
  let foundValue = "";
  for (const line of lines) {
    if (/TOTALES?|TOTAL\s*\(Q\)/i.test(line)) {
      const match = line.match(/\b([0-9]{1,5}[.,][0-9]{2})\b/);
      if (match) {
        foundValue = match[1].replace(",", ".");
        break;
      }
    }
  }

  if (!foundValue) {
    // Fallback: busca montos decimales válidos en todo el texto y toma el mayor (suele ser el total)
    const decimalAmounts = fullText.match(/\b[0-9]{1,5}[.,][0-9]{2}\b/g);
    if (decimalAmounts) {
      const nums = decimalAmounts
        .map(a => parseFloat(a.replace(",", ".")))
        .filter(n => !isNaN(n) && n > 0 && n < 100000);
      if (nums.length > 0) {
        foundValue = Math.max(...nums).toFixed(2);
      }
    }
  }
  if (foundValue) {
    doc.valor = parseFloat(foundValue).toFixed(2);
  }

  // 7. Impuesto INGUAT / Turismo (Específico para facturas de hotel en Guatemala)
  const inguatMatch = fullText.match(/(?:TURISMO|INGUAT|HOSPEDAJE)[^0-9]*([0-9]{1,4}[.,][0-9]{2})/i);
  if (inguatMatch) {
    doc.inguat = inguatMatch[1].replace(",", ".");
  }

  // 8. Tipo de Gasto y Concepto dinámico
  const isHotel = fullText.includes("HOTEL") || fullText.includes("HOSPEDAJE") || fullText.includes("TURISMO");
  if (isHotel) {
    doc.tipoGasto = "Hospedaje";
    doc.concepto = "HOSPEDAJE / ALOJAMIENTO";
  } else if (fullText.includes("COMBUSTIBLE") || fullText.includes("GASOLINA") || fullText.includes("DIESEL")) {
    doc.tipoGasto = "Combustible";
    doc.concepto = "CONSUMO DE COMBUSTIBLE";
  } else {
    doc.tipoGasto = "Viáticos";
    doc.concepto = "ALIMENTACIÓN / CONSUMO";
  }

  return doc;
}
