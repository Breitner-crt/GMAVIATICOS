import { readSheet } from "@/lib/sheets";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readSheet();
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}
