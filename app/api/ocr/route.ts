import { NextResponse } from "next/server";
import { extractFromPhoto, ocrEnabled } from "@/lib/ocr";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!ocrEnabled()) {
      return NextResponse.json(
        { error: "El servicio de lectura no está configurado (falta GROQ_API_KEY)." },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se adjuntó ninguna imagen." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const documents = await extractFromPhoto(base64, mimeType);

    return NextResponse.json({ documents });
  } catch (error) {
    return jsonError(error);
  }
}
