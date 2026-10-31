import { hasServiceAccount } from "@/lib/google";
import { uploadImageToDrive } from "@/lib/drive";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Módulo independiente de fotos: recibe una imagen en base64, la sube a la
 * carpeta de Google Drive y devuelve el enlace. No toca el formulario ni la hoja.
 */
export async function POST(request: Request) {
  try {
    if (!hasServiceAccount()) {
      throw new Error(
        "Falta configurar GOOGLE_SERVICE_ACCOUNT_JSON en Vercel para subir fotos a Google Drive."
      );
    }

    const body = (await request.json()) as { photoBase64?: string; filename?: string };
    const photo = await uploadImageToDrive(body.photoBase64 ?? "", body.filename);
    return Response.json(photo);
  } catch (error) {
    return jsonError(error);
  }
}
