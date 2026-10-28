import { NextResponse } from "next/server";
import { serviceAccountEmail } from "@/lib/google";
import { jsonError } from "@/lib/http";
import {
  SHEET_COOKIE,
  dataSource,
  parseSheetId,
  readSheet,
  resetSheet,
  sheetConfig,
} from "@/lib/sheets";
import type { SheetData } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Devuelve la hoja activa y el correo que hay que compartir. */
export async function GET() {
  try {
    const { sheetId, tab } = await sheetConfig();
    return Response.json({
      sheetId,
      tab,
      source: dataSource(),
      serviceAccountEmail: serviceAccountEmail(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Cambia la hoja activa. Verifica el acceso antes de guardarla. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sheetId?: string };
    const sheetId = parseSheetId(String(body.sheetId ?? ""));

    // Si no se puede leer, no se guarda: así no se queda con una hoja rota.
    const data = await readSheet({ sheetId });

    const response = NextResponse.json({
      ...data,
      meta: { ...data.meta, sheetId },
    } satisfies SheetData);
    response.cookies.set({
      name: SHEET_COOKIE,
      value: sheetId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

/** Vuelve a la hoja configurada en las variables de entorno. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: SHEET_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}

/** Vacía el formato para empezar una liquidación nueva. */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { scope?: string };
    const scope = body.scope === "all" ? "all" : "items";
    const data = await resetSheet(scope);
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}
