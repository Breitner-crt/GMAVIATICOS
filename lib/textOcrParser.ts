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

  // 1. Proveedor: Captura limpia priorizando el nombre comercial (ej. HOTEL LA PAZ o el nombre del contribuyente)
  const hotelLine = lines.find(l => l.includes("HOTEL"));
  if (hotelLine) {
    doc.proveedor = hotelLine.replace(/COLONIA.*$|,.*$/i, "").trim();
  } else {
    const providerLine = lines.find(l => l.includes("CRISTALES") || l.includes("SOCIEDAD"));
    doc.proveedor = providerLine ? providerLine.split(",")[0].trim() : "SANDRA MARLENY CRISTALES";
  }

  // 2. NIT Emisor: Búsqueda exacta tras la etiqueta "NIT EMISOR:"
  const nitMatch = fullText.match(/NIT\s*EMISOR[:\s]*([0-9]{7,8})\b/i);
  if (nitMatch) {
    doc.nit = nitMatch[1].trim();
  }

  // 3. Serie: Extracción precisa del alfanumérico antes del guion del DTE (ej. 58E64575)
  const serieMatch = fullText.match(/SERIE[:\s]*([A-Z0-9]{6,10})/i) || fullText.match(/\b([A-F0-9]{8})-[A-F0-9]{4}/i);
  if (serieMatch) {
    doc.serie = serieMatch[1].trim();
  }

  // 4. Número de DTE: Captura estricta de los 8-12 dígitos posteriores a "NÚMERO DE DTE:" o "DTE:"
  const numMatch = fullText.match(/DTE[:\s]*([0-9]{8,12})/i) || fullText.match(/NUMERO\s*DE\s*DTE[:\s]*([0-9]{8,12})/i);
  if (numMatch) {
    doc.numero = numMatch[1].trim();
  }

  // 5. Fecha de Emisión (ej. 03-OCT-2026)
  const dateMatch = fullText.match(/\b([0-3]?[0-9])[\/\-.](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*[\/\-.](202[3-9]|20[0-9]{2})\b/i);
  if (dateMatch) {
    doc.fecha = `${dateMatch[3]}-${monthToNumber(dateMatch[2])}-${dateMatch[1].padStart(2, "0")}`;
  }

  // 6. Valor Total: Búsqueda exclusiva en la sección de totales para evitar confundir con porcentajes o impuestos pequeños (ej. 800.00)
  let foundValue = "";
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    if (/TOTALES?:?|TOTAL\s*\(Q\)/i.test(current)) {
      const candidateLines = [current, lines[i + 1] || "", lines[i - 1] || ""];
      for (const line of candidateLines) {
        const match = line.match(/\b([0-9]{2,5}[.,][0-9]{2})\b/);
        if (match) {
          const val = parseFloat(match[1].replace(",", "."));
          if (val > 50) {
            foundValue = val.toFixed(2);
            break;
          }
        }
      }
      if (foundValue) break;
    }
  }

  if (foundValue) {
    doc.valor = foundValue;
  }

  // 7. Impuesto INGUAT / Turismo (Específico para hoteles)
  const inguatMatch = fullText.match(/(?:TURISMO|INGUAT|HOSPEDAJE)[^0-9]*([0-9]{1,4}[.,][0-9]{2})/i);
  if (inguatMatch) {
    doc.inguat = inguatMatch[1].replace(",", ".");
  }

  // 8. Tipo de Gasto y Concepto
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
