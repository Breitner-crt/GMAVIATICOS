import { saveTotals } from "@/lib/sheets";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { acreditado?: number; corte?: number };
    const data = await saveTotals({
      acreditado:
        body.acreditado === undefined || body.acreditado === null
          ? undefined
          : Number(body.acreditado),
      corte:
        body.corte === undefined || body.corte === null ? undefined : Number(body.corte),
    });
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}
