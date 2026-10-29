import type { Item, OcrDocument } from "./types";

export type { OcrDocument };

/** Modelo único confirmado compatible con claves AQ de Google AI Studio */
export const GEMINI_MODEL = "gemini-3.8-flash";
export const DEFAULT_MODEL = GEMINI_MODEL; // alias para compatibilidad

export const PROMPT = `Analiza esta imagen de factura o comprobante de gasto (especialmente facturas DTE / FEL de Guatemala) y extrae los datos en formato JSON estricto con esta estructura exacta (sin markdown, sin explicaciones):
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
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim());
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      if (base64) {
        resolve(base64);
      } else {
        reject(new Error("No se pudo convertir la imagen a base64."));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Llamada directa a Gemini desde el navegador — modelo fijo gemini-3.8-flash */
export async function extractDirectFromGemini(
  apiKey: string,
  base64: string,
  mimeType: string,
  _preferredModel?: string  // ignorado — siempre usamos GEMINI_MODEL
): Promise<OcrDocument[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
        maxOutputTokens: 1024,
        response_mime_type: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("La IA no devolvió resultados para esta imagen.");
  }

  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const docs = Array.isArray(parsed.documentos) ? parsed.documentos : [];

  if (docs.length === 0) {
    throw new Error("No se detectó una factura válida en la imagen.");
  }

  return docs.map(normalizeOcrDocument);
}

/** Procesamiento desde el servidor (fallback) */
export async function extractFromPhoto(
  base64: string,
  mimeType: string
): Promise<OcrDocument[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Falta configurar la variable GEMINI_API_KEY en Vercel.");
  }

  const preferredModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  return extractDirectFromGemini(apiKey, base64, mimeType, preferredModel);
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
