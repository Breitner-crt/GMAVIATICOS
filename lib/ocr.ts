import type { Item, OcrDocument } from "./types";

export type { OcrDocument };

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    documentos: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          proveedor: { type: "STRING" },
          nit: { type: "STRING" },
          tipoDoc: { type: "STRING", enum: ["FAC", "FPC", "REC"] },
          serie: { type: "STRING" },
          numero: { type: "STRING" },
          fecha: { type: "STRING" },
          placa: { type: "STRING" },
          concepto: { type: "STRING" },
          tipoGasto: {
            type: "STRING",
            enum: [
              "Combustible",
              "Viáticos",
              "Hospedaje",
              "Materiales",
              "Proveedores",
              "Comisión",
              "Otros",
            ],
          },
          valor: { type: "NUMBER" },
          galones: { type: "NUMBER" },
          tipoComb: { type: "STRING", enum: ["S", "R", "D"] },
          inguat: { type: "NUMBER" },
          pais: { type: "STRING" },
          sitio: { type: "STRING" },
          confianza: { type: "STRING", enum: ["alta", "media", "baja"] },
        },
        required: ["proveedor", "concepto", "valor", "confianza"],
      },
    },
  },
  required: ["documentos"],
} as const;

const PROMPT = `Eres un asistente que digitaliza facturas y recibos de Guatemala para un formato de liquidación de viáticos.

Analiza la fotografía y extrae TODOS los documentos o facturas visibles. Si la foto muestra una sola factura, devuelve un solo elemento.

Reglas:
- No inventes datos. Si un campo no aparece, devuélvelo vacío ("" o 0).
- "proveedor": nombre comercial del establecimiento tal como aparece.
- "nit": NIT del proveedor, solo dígitos y guiones.
- "tipoDoc": FAC para factura, FPC para factura de pequeño contribuyente, REC para recibo. Si no es claro, usa "FAC".
- "serie": serie o prefijo del documento (puede ser alfanumérica).
- "numero": número del documento, sin la serie.
- "fecha": en formato YYYY-MM-DD. Si el año no aparece, usa el año actual.
- "placa": placa del vehículo si el documento la muestra (típico en combustible).
- "concepto": descripción breve y clara de lo comprado (ej. "COMBUSTIBLE", "HOSPEDAJE 5 PERSONAS", "ALMUERZO").
- "tipoGasto": clasifica en Combustible, Viáticos, Hospedaje, Materiales, Proveedores, Comisión u Otros.
- "valor": total pagado en quetzales, solo el número (sin "Q" ni comas de miles). Usa punto decimal.
- "galones": galones cargados, solo si es combustible.
- "tipoComb": S para súper, R para regular, D para diésel. Vacío si no aplica.
- "inguat": monto de INGUAT si aparece como línea separada; 0 si no.
- "pais": país (por defecto "GUATEMALA").
- "sitio": municipio, ciudad o nombre del lugar si se puede inferir del documento.
- "confianza": alta, media o baja según qué tan legible esté el documento.

Si hay varias facturas en la misma foto, sepáralas. Si el texto es manuscrito, lee con cuidado y marca confianza media o baja cuando dudes.`;

export function ocrEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function extractFromPhoto(
  base64: string,
  mimeType: string
): Promise<OcrDocument[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Falta GEMINI_API_KEY. Configúrala en Vercel para poder leer fotografías."
    );
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const res = await fetch(url, {
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
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `El servicio de lectura respondió ${res.status}. ${detail.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("La IA no devolvió datos. Intenta con una foto más clara.");
  }

  let parsed: { documentos?: Partial<OcrDocument>[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("La IA devolvió una respuesta ilegible. Intenta de nuevo.");
  }

  const docs = Array.isArray(parsed.documentos) ? parsed.documentos : [];
  return docs.map(normalizeOcrDocument).filter((doc) => doc.proveedor || doc.valor);
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asAmount(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value * 100) / 100);
  }
  const cleaned = asText(value).replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? String(Math.round(num * 100) / 100) : "";
}

function normalizeOcrDocument(raw: Partial<OcrDocument>): OcrDocument {
  const tipoDoc = asText(raw.tipoDoc).toUpperCase();
  const tipoComb = asText(raw.tipoComb).toUpperCase();
  const tipoGasto = asText(raw.tipoGasto);

  return {
    proveedor: asText(raw.proveedor).toUpperCase(),
    nit: asText(raw.nit),
    tipoDoc: ["FAC", "FPC", "REC"].includes(tipoDoc) ? tipoDoc : "FAC",
    serie: asText(raw.serie),
    numero: asText(raw.numero),
    fecha: normalizeDate(asText(raw.fecha)),
    placa: asText(raw.placa).toUpperCase(),
    concepto: asText(raw.concepto).toUpperCase(),
    tipoGasto,
    valor: asAmount(raw.valor),
    galones: asAmount(raw.galones),
    tipoComb: ["S", "R", "D"].includes(tipoComb) ? tipoComb : "",
    inguat: asAmount(raw.inguat),
    pais: asText(raw.pais).toUpperCase() || "GUATEMALA",
    sitio: asText(raw.sitio).toUpperCase(),
    confianza: raw.confianza === "alta" || raw.confianza === "baja" ? raw.confianza : "media",
  };
}

function normalizeDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${month}-${day}`;
  }
  return "";
}

/** Convierte el resultado del OCR al formato interno de un gasto. */
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
