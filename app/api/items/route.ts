import { addItem, deleteItem, updateItem } from "@/lib/sheets";
import { uploadImageToDrive } from "@/lib/drive";
import { jsonError } from "@/lib/http";
import type { Item } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { item?: Partial<Item>; photoBase64?: string };
    let photoUrl = "";

    // Si viene una foto en base64, la subimos a Google Drive
    if (body.photoBase64) {
      try {
        photoUrl = await uploadImageToDrive(body.photoBase64);
      } catch (driveErr) {
        console.error("Error al subir a Google Drive:", driveErr);
      }
    }

    // Guardamos los datos en Sheets, incluyendo el enlace de Google Drive en el campo 'sitio' o donde corresponda
    const itemData = {
      ...(body.item ?? {}),
      sitio: photoUrl || body.item?.sitio || "",
    };

    const data = await addItem(itemData);
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { row?: number; item?: Partial<Item> };
    const row = Number(body.row);
    if (!Number.isInteger(row)) throw new Error("Fila inválida.");
    const data = await updateItem(row, body.item ?? {});
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { row?: number };
    const row = Number(body.row);
    if (!Number.isInteger(row)) throw new Error("Fila inválida.");
    const data = await deleteItem(row);
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}
