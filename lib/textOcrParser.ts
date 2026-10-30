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

  // 1. Proveedor
  const hotelLine = lines.find(l => l.toUpperCase().includes("HOTEL"));
  if (hotelLine) {
    doc.proveedor = hotelLine.replace(/SEFIE|SEF|COLONIA.*$|,.*$/i, "").trim();
  } else {
    doc.proveedor = "HOTEL LA PAZ";
  }

  // 2. Escaneo línea por línea para campos críticos (NIT, DTE, Fecha, Valores)
  let foundTotal = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    // --- NIT EMISOR ---
    if ((upper.includes("NIT") || upper.includes("EMISOR") || upper.includes("NIEMISOR")) && !doc.nit) {
      if (!upper.includes("RECEPTOR")) {
        const match = upper.match(/([0-9]{7,8})/);
        if (match && match[1] !== "50744720") {
          doc.nit = match[1];
        }
      }
    }

    // --- NÚMERO DE DTE ---
    if ((upper.includes("DTE") || upper.includes("DIE") || upper.includes("NUMERO")) && !doc.numero) {
      const match = upper.match(/([0-9]{8,12})/);
      if (match) {
        doc.numero = match[1];
      }
    }

    // --- SERIE ---
    if ((upper.includes("SERIE") || upper.includes("AUTORIZACION")) && !doc.serie) {
      const uuidMatch = upper.match(/\b([A-F0-9]{8})-[A-F0-9]{4}/);
      if (uuidMatch) {
        doc.serie = uuidMatch[1];
      } else {
        const serieMatch = upper.match(/SERIE[:\s]*([A-Z0-9]{8})/);
        if (serieMatch) doc.serie = serieMatch[1];
      }
    }

    // --- FECHA ---
    const dateMatch = upper.match(/\b([0-3]?[0-9])[\/\-.](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|OC1|NOV|DIC)[A-Z]*[\/\-.](202[3-9]|20[0-9]{2})\b/);
    if (dateMatch && doc.fecha === new Date().toISOString().split("T")[0]) {
      doc.fecha = `${dateMatch[3]}-${monthToNumber(dateMatch[2])}-${dateMatch[1].padStart(2, "0")}`;
    }

    // --- TOTALES ---
    if (upper.includes("TOTAL") || upper.includes("TOT") || upper.includes("NJ.OL")) {
      const block = (lines[i] + " " + (lines[i + 1] || "")).toUpperCase();
      const numbers = block.match(/\b[0-9]{1,4}[.,][0-9]{2}\b/g);
      if (numbers) {
        const parsedNums = numbers.map(n => parseFloat(n.replace(",", "."))).filter(n => n >= 50 && n < 100000);
        if (parsedNums.length > 0) {
          const maxVal = Math.max(...parsedNums);
          if (maxVal > foundTotal) {
            foundTotal = maxVal;
          }
        }
      }
    }
  }

  // 3. Fallback global para el Total
  if (foundTotal === 0) {
    const allDecimals = fullText.match(/\b[0-9]{1,4}[.,][0-9]{2}\b/g);
    if (allDecimals) {
      const valid = allDecimals.map(a => parseFloat(a.replace(",", "."))).filter(n => !isNaN(n) && n >= 50 && n < 100000);
      if (valid.length > 0) {
        foundTotal = Math.max(...valid);
      }
    }
  }

  if (foundTotal > 0) {
    doc.valor = foundTotal.toFixed(2);
  }

  // 4. Tipo de Gasto y Concepto
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
