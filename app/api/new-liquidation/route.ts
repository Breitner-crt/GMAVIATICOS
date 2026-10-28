import { jsonError } from "@/lib/http";
import { archiveAndReset } from "@/lib/sheets";

export const dynamic = "force-dynamic";

/**
 * Archiva la liquidación actual como pestaña nueva y deja el formato en blanco.
 */
export async function POST() {
  try {
    const { data, archivedAs } = await archiveAndReset();
    return Response.json({ ...data, archivedAs });
  } catch (error) {
    return jsonError(error);
  }
}
