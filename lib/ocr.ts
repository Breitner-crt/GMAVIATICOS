import type { Item, OcrDocument } from "./types";

export type { OcrDocument };

const PROMPT = `Analiza esta factura DTE de Guatemala y extrae los datos en formato JSON estricto con esta estructura exacta (sin markdown, sin bloques de código):
{
  "documentos": [
    {
      "proveedor": "Nombre comercial del establecimiento (ej. HOTEL LA PAZ)",
      "nit": "NIT del emisor (ej. 17629349)",
      "tipoDoc": "FAC",
      "serie": "Serie del DTE (ej. 58E64575)",
      "numero": "Número del DTE (ej. 1617250229)",
      "fecha": "YYYY-MM-DD (ej. 2026-10-03)",
      "placa": "",
      "concepto": "Descripción breve del servicio o bien",
      "tipoGasto": "Hospedaje",
      "valor": 800.00,
      "galones": 0,
      "tipoComb": "",
      "inguat": 65.57,
      "pais": "GUATEMALA",
      "sitio": "PUERTO BARRIOS, IZABAL",
      "confianza": "alta"
    }
  ]
}
Reglas:
- tipoGasto debe ser estrictamente uno de: Combustible, Viáticos, Hospedaje, Materiales, Proveedores, Comisión u Otros.
- Extrae el NIT del emisor (no el receptor).
- Extrae el total exacto pagado en valor.`;

export function ocrEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export async function extractFromPhoto(
  base64: string,
  mimeType: string
): Promise<OcrDocument[]> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Falta configurar GROQ_API_KEY en Vercel.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.2-11b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error en Groq Vision (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("La IA no devolvió resultados.");
  }

  try {
    const parsed = JSON.parse(content);
    const docs = Array.isArray(parsed.documentos) ? parsed.documentos : [];
    return docs.map(normalizeOcrDocument);
  } catch {
    throw new Error("No se pudo interpretar la respuesta de la lectura.");
  }
}

function normalizeOcrDocument(raw: any): OcrDocument {
  return {
    proveedor: String(raw.proveedor || "").toUpperCase(),
    nit: String(raw.nit || ""),
    tipoDoc: [\"FAC\", \"FPC\", \"REC\"].includes(raw.tipoDoc) ? raw.tipoDoc : \"FAC\",
    serie: String(raw.serie || ""),
    numero: String(raw.numero || ""),
    fecha: String(raw.fecha || new Date().toISOString().split("T")[0]),
    placa: String(raw.placa || "").toUpperCase(),
    concepto: String(raw.concepto || "").toUpperCase(),
    tipoGasto: String(raw.tipoGasto || "Viáticos"),
    valor: String(raw.valor || "0"),
    galones: String(raw.galones || ""),
    tipoComb: [\"S\", \"R\", \"D\"].includes(raw.tipoComb) ? raw.tipoComb : "",
    inguat: String(raw.inguat || ""),
    pais: String(raw.pais || "GUATEMALA").toUpperCase(),
    sitio: String(raw.sitio || "").toUpperCase(),
    confianza: "alta",
  };
}

export function ocrToItem(doc: OcrDocument): Omit<Item, \"row\" | \"no\"> {
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
