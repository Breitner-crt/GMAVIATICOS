import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return jsonError(new Error("El OCR ahora se ejecuta localmente en el dispositivo."));
}
