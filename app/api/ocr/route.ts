import { extractFromPhoto, ocrEnabled } from "@/lib/ocr";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET() {
  return Response.json({ enabled: ocrEnabled() });
}

export async function POST(request: Request) {
  try {
    if (!ocrEnabled()) {
      throw new Error(
        "La lectura de fotos no está activada: falta GEMINI_API_KEY en Vercel."
      );
    }

    const form = await request.formData();
    const file = form.get("photo");

    if (!(file instanceof File)) {
      throw new Error("No se recibió ninguna fotografía.");
    }
    if (file.size > MAX_BYTES) {
      throw new Error("La foto es demasiado grande (máximo 8 MB).");
    }

    const mimeType = file.type || "image/jpeg";
    if (!mimeType.startsWith("image/")) {
      throw new Error("El archivo debe ser una imagen.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const documents = await extractFromPhoto(buffer.toString("base64"), mimeType);

    return Response.json({ documents });
  } catch (error) {
    return jsonError(error);
  }
}
