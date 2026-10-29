import type { OcrDocument } from "./types";

/**
 * Normaliza y limpia cadenas de texto de OCR
 */
function cleanText(str: string): string {
  return str.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
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

  // 1. Extraer NIT Emisor (ej: "NIT: 1234567-8", "NIT 12345678", "N.I.T. 8392019-K")
  // Excluimos explícitamente "CF" o consumidor final
  const nitMatch = text.match(/(?:NIT|N\.I\.T\.|N I T)[\s.:#-]*([0-9]{4,10}[-\s]?[0-9Kk])/i);
  if (nitMatch && nitMatch[1]) {
    const cleanNit = nitMatch[1].replace(/[^0-9Kk]/gi, "");
    if (cleanNit.toUpperCase() !== "CF") {
      doc.nit = cleanNit;
    }
  }

  // 2. Extraer Serie (DTE o Factura común)
  // Ej: "Serie: A1B2C3D4", "SERIE B", "SERIE: 2E3B1C56"
  const serieMatch = text.match(/(?:SERIE|NO\.\s*SERIE)[\s.:#-]*([A-Z0-9]{1,12})/i);
  if (serieMatch && serieMatch[1]) {
    doc.serie = serieMatch[1].toUpperCase();
  }

  // 3. Extraer Número de DTE o Factura
  // Ej: "Número: 1234567890", "DTE: 3948202", "Factura No. 4521"
  const numMatch = text.match(/(?:N[ÚU]MERO|NUMERO|DTE|FACTURA\s*(?:NO\.?|#)?)[\s.:#-]*([0-9]{3,14})/i);
  if (numMatch && numMatch[1]) {
    doc.numero = numMatch[1];
  }

  // 4. Extraer Fecha (Formatos: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY)
  const dateMatch = text.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](202[3-9]|20[0-9]{2})\b/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const month = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3];
    // En Guatemala se usa DD/MM/YYYY
    doc.fecha = `${year}-${month}-${day}`;
  } else {
    // Probar formato ISO YYYY-MM-DD
    const isoDate = text.match(/\b(202[3-9])[\/\-.]([0-1]?[0-9])[\/\-.]([0-3]?[0-9])\b/);
    if (isoDate) {
      doc.fecha = `${isoDate[1]}-${isoDate[2].padStart(2, "0")}-${isoDate[3].padStart(2, "0")}`;
    }
  }

  // 5. Extraer Monto Total (buscar Q, TOTAL, TOTAL A PAGAR, etc.)
  // Captura números con punto o coma decimal
  const totalRegexes = [
    /(?:TOTAL\s*(?:A\s*PAGAR|PAGADO|FACTURA)?|MONTO\s*TOTAL)[\s.:$Q]*([0-9]{1,6}(?:[,.][0-9]{2,3})*(?:[.,][0-9]{2}))/i,
    /(?:Q\.?|GTQ)[\s]*([0-9]{1,6}(?:[,.][0-9]{2,3})*(?:[.,][0-9]{2}))/i,
    /\bTOTAL[\s.:$Q]*([0-9]+[.,][0-9]{2})\b/i,
  ];

  for (const regex of totalRegexes) {
    const totalMatch = text.match(regex);
    if (totalMatch && totalMatch[1]) {
      // Normalizar número eliminando comas de miles y dejando punto decimal
      let valStr = totalMatch[1].replace(/,/g, ".");
      // Si tiene más de un punto, el último es el separador decimal
      const parts = valStr.split(".");
      if (parts.length > 2) {
        valStr = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
      }
      const numVal = parseFloat(valStr);
      if (!isNaN(numVal) && numVal > 0) {
        doc.valor = numVal.toFixed(2);
        break;
      }
    }
  }

  // 6. Clasificación de Tipo de Gasto y detección de combustible
  const lowerText = text.toLowerCase();

  const isFuel =
    lowerText.includes("gasolin") ||
    lowerText.includes("diesel") ||
    lowerText.includes("diésel") ||
    lowerText.includes("regular") ||
    lowerText.includes("superior") ||
    lowerText.includes("shell") ||
    lowerText.includes("puma") ||
    lowerText.includes("uno") ||
    lowerText.includes("texaco") ||
    lowerText.includes("combustible");

  const isHotel =
    lowerText.includes("hotel") ||
    lowerText.includes("hospedaje") ||
    lowerText.includes("posada") ||
    lowerText.includes("hostal") ||
    lowerText.includes("habitacion") ||
    lowerText.includes("habitación");

  if (isFuel) {
    doc.tipoGasto = "Combustible";
    doc.concepto = "CONSUMO DE COMBUSTIBLE";

    // Tipo de combustible
    if (lowerText.includes("superior")) doc.tipoComb = "S";
    else if (lowerText.includes("regular")) doc.tipoComb = "R";
    else if (lowerText.includes("diesel") || lowerText.includes("diésel")) doc.tipoComb = "D";

    // Galones (ej: "8.52 GALS", "CANT: 10.00", "GALONES: 5.5")
    const galMatch = text.match(/(?:GALONES|GALS?|CANTIDAD|CANT\.?)[\s.:]*([0-9]+[.,][0-9]{1,3})/i);
    if (galMatch && galMatch[1]) {
      const g = parseFloat(galMatch[1].replace(/,/g, "."));
      if (!isNaN(g) && g > 0 && g < 100) {
        doc.galones = g.toFixed(2);
      }
    }
  } else if (isHotel) {
    doc.tipoGasto = "Hospedaje";
    doc.concepto = "HOSPEDAJE";
  } else {
    doc.tipoGasto = "Viáticos";
    doc.concepto = "ALIMENTACIÓN / CONSUMO";
  }

  // 7. Estimación del Nombre del Proveedor:
  // En las facturas el nombre comercial casi siempre viene en las primeras 3-4 líneas
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    // Evitar líneas con encabezados genéricos
    if (
      line.length > 3 &&
      line.length < 50 &&
      !line.match(/factura|dte|documento|tributario|sat|fel|original|cliente|nit/i)
    ) {
      doc.proveedor = line.toUpperCase();
      break;
    }
  }

  if (!doc.proveedor) {
    doc.proveedor = isFuel ? "ESTACIÓN DE SERVICIO" : "ESTABLECIMIENTO COMERCIAL";
  }

  return doc;
}
