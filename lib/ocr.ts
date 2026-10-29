import type { Item, OcrDocument } from "./types";

export type { OcrDocument };

const PROMPT = `Analiza esta imagen de factura o comprobante de gasto (especialmente facturas DTE / FEL de Guatemala) y extrae los datos en formato JSON estricto con esta estructura exacta (sin markdown, sin explicaciones):
{
  "documentos": [
    {
      "proveedor": "Nombre comercial del establecimiento o emisor (ej: SHELL SAN CRISTOBAL, RESTAURANTE LOS CEBOLLINES, HOTEL DEL PATIO)",
      "nit": "NIT del emisor (sin guiones)",
      "tipoDoc": "FAC",
      "serie": "Serie del DTE o factura",
      "numero": "Número del DTE o número de factura",
      "fecha": "YYYY-MM-DD",
      "placa": "",
      "concepto": "Descripción breve del bien o servicio adquirido",
      "tipoGasto": "Viáticos",
      "valor": 150.00,
      "galones": 0,
      "tipoComb": "",
      "inguat": 0,
      "pais": "GUATEMALA",
      "sitio": "",
      "confianza": "alta"
    }
  ]
}

Reglas estrictas de extracción:
1. "proveedor": Extrae el NOMBRE COMERCIAL del negocio que vendió el bien o servicio. No pongas el nombre del certificador DTE (como INFILE, MEGAPRINT, DIGIFACT, GUATEFACTURAS ni SAT).
2. "nit": Extrae el NIT del EMISOR (el negocio que vende). NUNCA pongas el NIT del receptor / cliente ni 'CF'.
3. "tipoGasto": Clasifica estrictamente en una de estas opciones:
   - "Combustible" (gasolina, diesel en estaciones de servicio)
   - "Hospedaje" (hoteles, moteles, posadas)
   - "Viáticos" (restaurantes, cafeterías, comida, supermercado)
   - "Materiales" (ferreterías, repuestos, suministros)
   - "Proveedores" (servicios técnicos, honorarios)
   - "Comisión" o "Otros"
4. Si es "Combustible":
   - "tipoComb": pon "S" para Superior, "R" para Regular, "D" para Diésel.
   - "galones": cantidad exacta de galones comprados en número (ej: 8.52).
5. "valor": Monto TOTAL EXACTO pagado con decimales (número, ej: 250.00). Si hay propina incluida en el total pagado, usa el total final pagado.
6. "fecha": Fecha de emisión en formato YYYY-MM-DD.
7. "tipoDoc": debe ser "FAC" (factura general), "FPC" (factura pequeño contribuyente) o "REC" (recibo).`;

export function ocrEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function extractFromPhoto(
  base64: string,
  mimeType: string
): Promise<OcrDocument[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Falta configurar la variable GEMINI_API_KEY en Vercel.");
  }

  const preferredModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  // Modelos a intentar en orden de preferencia
  const modelsToTry = Array.from(new Set([preferredModel, "gemini-2.5-flash", "gemini-1.5-flash"]));

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType || "image/jpeg",
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            response_mime_type: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        // Si el modelo da 404, probamos el siguiente modelo
        if (response.status === 404 && modelsToTry.indexOf(model) < modelsToTry.length - 1) {
          continue;
        }
        throw new Error(`Google Gemini (${response.status}): ${errText.slice(0, 180)}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error("La IA no devolvió resultados para esta imagen.");
      }

      // Limpiar posibles delimitadores de código markdown por seguridad
      const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const docs = Array.isArray(parsed.documentos) ? parsed.documentos : [];

      if (docs.length === 0) {
        throw new Error("No se pudo identificar una factura válida en la imagen.");
      }

      return docs.map(normalizeOcrDocument);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Si fue error de parseo o fallo general con respuesta, no reintentamos
      if (lastError.message.includes("No se pudo identificar") || lastError.message.includes("Falta configurar")) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error("Error desconocido al procesar la imagen con Gemini.");
}

function normalizeOcrDocument(raw: any): OcrDocument {
  const allowedDocTypes = ["FAC", "FPC", "REC"];
  const tipoDocVal = allowedDocTypes.includes(raw.tipoDoc) ? raw.tipoDoc : "FAC";

  const allowedComb = ["S", "R", "D"];
  const tipoCombVal = allowedComb.includes(raw.tipoComb) ? raw.tipoComb : "";

  return {
    proveedor: String(raw.proveedor || "").toUpperCase(),
    nit: String(raw.nit || "").replace(/[^0-9Kk-]/g, ""),
    tipoDoc: tipoDocVal,
    serie: String(raw.serie || ""),
    numero: String(raw.numero || ""),
    fecha: String(raw.fecha || new Date().toISOString().split("T")[0]),
    placa: String(raw.placa || "").toUpperCase(),
    concepto: String(raw.concepto || "").toUpperCase(),
    tipoGasto: String(raw.tipoGasto || "Viáticos"),
    valor: String(raw.valor || "0"),
    galones: String(raw.galones || ""),
    tipoComb: tipoCombVal,
    inguat: String(raw.inguat || ""),
    pais: String(raw.pais || "GUATEMALA").toUpperCase(),
    sitio: String(raw.sitio || "").toUpperCase(),
    confianza: "alta",
  };
}

export function ocrToItem(doc: OcrDocument): Omit<Item, "row" | "no"> {
  return {
    proveedor: doc.proveedor,
    nit: doc.nit,
    tipoDoc: doc.tipoDoc,
    serie: doc.serie,
    numero: doc.numero,
    fecha: doc.fecha,
    placa: doc.placa,
    concepto: doc.concepto,
    tipoGasto: doc.tipoGasto,
    valor: doc.valor,
    galones: doc.galones,
    tipoComb: doc.tipoComb,
    inguat: doc.inguat,
    pais: doc.pais,
    sitio: doc.sitio,
    idp: "",
    neto: "",
    base: "",
    iva: "",
  };
}
