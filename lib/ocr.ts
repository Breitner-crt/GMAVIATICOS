import type { Item, OcrDocument } from "./types";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type { OcrDocument };

const PROMPT = `Analiza esta factura DTE de Guatemala y extrae los datos en formato JSON estricto con esta estructura exacta (sin markdown, sin bloques de código):
{
  "documentos": [
    {
      "proveedor": "Nombre comercial del establecimiento",
      "nit": "NIT del emisor",
      "tipoDoc": "FAC",
      "serie": "Serie del DTE",
      "numero": "Número del DTE",
      "fecha": "YYYY-MM-DD",
      "placa": "",
      "concepto": "Descripción breve del servicio o bien",
      "tipoGasto": "Hospedaje",
      "valor": 800.00,
      "galones": 0,
      "tipoComb": "",
      "inguat": 0,
      "pais": "GUATEMALA",
      "sitio": "",
      "confianza": "alta"
    }
  ]
}
Reglas:
- tipoGasto debe ser estrictamente uno de: Combustible, Viáticos, Hospedaje, Materiales, Proveedores, Comisión u Otros.
- Extrae el NIT del emisor.
- Extrae el total exacto pagado en valor.`;

export function ocrEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function extractFromPhoto(
  base64: string,
  mimeType: string
): Promise<OcrDocument[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en Vercel.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Usamos gemini-1.5-flash con el SDK oficial, que es el modelo estándar y estable de Google
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent([
    PROMPT,
    {
      inlineData: {
        data: base64,
        mimeType: mimeType || "image/jpeg",
      },
    },
  ]);

  const responseText = result.response.text();
  if (!responseText) {
    throw new Error("La IA no devolvió resultados.");
  }

  // Limpiar posibles bloques de código markdown si la IA los incluye
  const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleanJson);
    const docs = Array.isArray(parsed.documentos) ? parsed.documentos : [];
    return docs.map(normalizeOcrDocument);
  } catch {
    throw new Error("No se pudo interpretar la respuesta de la lectura.");
  }
}

function normalizeOcrDocument(raw: any): OcrDocument {
  const allowedDocTypes = ["FAC", "FPC", "REC"];
  const tipoDocVal = allowedDocTypes.includes(raw.tipoDoc) ? raw.tipoDoc : "FAC";

  const allowedComb = ["S", "R", "D"];
  const tipoCombVal = allowedComb.includes(raw.tipoComb) ? raw.tipoComb : "";

  return {
    proveedor: String(raw.proveedor || "").toUpperCase(),
    nit: String(raw.nit || ""),
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
