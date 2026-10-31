import { addItem, deleteItem, updateItem } from "@/lib/sheets";
import { uploadImageToDrive } from "@/lib/drive";
import { errorMessage, jsonError } from "@/lib/http";
import type { Item } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { item?: Partial<Item>; photoBase64?: string };

    let photoUrl = "";
    let warning: string | undefined;

    if (body.photoBase64) {
      try {
        const photo = await uploadImageToDrive(body.photoBase64);
        photoUrl = photo.url;
      } catch (driveError) {
        warning = `El gasto se guardó, pero la foto no: ${errorMessage(driveError)}`;
      }
    }

    const itemData: Partial<Item> = { ...(body.item ?? {}) };
    if (photoUrl) itemData.sitio = photoUrl;

    const data = await addItem(itemData);
    return Response.json(warning ? { ...data, warning } : data);
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
