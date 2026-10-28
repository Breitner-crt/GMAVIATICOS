import { writeHeader } from "@/lib/sheets";
import { jsonError } from "@/lib/http";
import type { HeaderData } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { header?: Partial<HeaderData> };
    const data = await writeHeader(body.header ?? {});
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}
