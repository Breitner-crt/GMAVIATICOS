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

  // ==========================================
  // BLOQUE 1: ENCABEZADO (Metadatos de la Factura)
  // ==========================================
  
  // 1. Proveedor
  const hotelLine = lines.find(l => l.includes("HOTEL"));
  if (hotelLine) {
    doc.proveedor = hotelLine.replace(/SEFIE|SEF|COLONIA.*$|,.*$/i, "").trim();
  } else {
    doc.proveedor = "HOTEL LAPAZ";
  }

  // 2. NIT Emisor (Bloque superior)
  const nitMatch = fullText.match(/(?:NIEMISOR|EMISOR|NIT)[^0-9]*([0-9]{7,8})/i);
  if (nitMatch) {
    doc.nit = nitMatch[1].trim();
  }

  // 3. Serie (Primeros 8 caracteres alfanuméricos)
  const serieMatch = fullText.match(/\b([A-F0-9]{8})-[A-F0-9]{4}/i) || fullText.match(/SERIE[:\s]*([A-Z0-9]{8})/i);
  if (serieMatch) {
    doc.serie = serieMatch[1].trim();
  }

  // 4. Número de DTE
  const numMatch = fullText.match(/(?:DTE|DIE)[^0-9]*([0-9]{7,10})/i);
  if (numMatch) {
    doc.numero = numMatch[1].trim();
  }

  // 5. Fecha de Emisión
  const dateMatch = fullText.match(/\b([0-3]?[0-9])[\/\-.](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|OC1|NOV|DIC)[A-Z]*[\/\-.](202[3-9]|20[0-9]{2})\b/i);
  if (dateMatch) {
    doc.fecha = `${dateMatch[3]}-${monthToNumber(dateMatch[2])}-${dateMatch[1].padStart(2, "0")}`;
  }

  // ==========================================
  // BLOQUE 2: CUERPO Y TOTALES (Tabla de ítems)
  // ==========================================
  
  const totalesIndex = lines.findIndex(l => /TOTALES?|TOTAL/i.test(l));

  if (totalesIndex !== -1) {
    const blockTotales = lines.slice(totalesIndex, totalesIndex + 3).join(" ");
    const matches = blockTotales.match(/\b[0-9]{2,5}[.,][0-9]{2}\b/g);
    if (matches) {
      const nums = matches.map(m => parseFloat(m.replace(",", "."))).filter(n => n >= 10);
      if (nums.length > 0) {
        doc.valor = Math.max(...nums).toFixed(2);
      }
    }
  }

  if (doc.valor === "0") {
    const allAmounts = fullText.match(/\b[0-9]{2,5}[.,][0-9]{2}\b/g);
    if (allAmounts) {
      const validNums = allAmounts
        .map(a => parseFloat(a.replace(",", ".")))
        .filter(n => !isNaN(n) && n >= 50 && n < 10000);
      
      if (validNums.length > 0) {
        doc.valor = Math.max(...validNums).toFixed(2);
      }
    }
  }

  // ==========================================
  // BLOQUE 3: TIPO DE GASTO
  // ==========================================
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
