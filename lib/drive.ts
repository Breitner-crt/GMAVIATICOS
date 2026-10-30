import { getAccessToken } from "./google";

export async function uploadImageToDrive(base64Data: string): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) {
    throw new Error("Falta configurar GOOGLE_DRIVE_FOLDER_ID en Vercel.");
  }

  const token = await getAccessToken();

  const base64Clean = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");
  const buffer = Buffer.from(base64Clean, "base64");

  const metadata = {
    name: `factura_${Date.now()}.jpg`,
    parents: [folderId],
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([buffer], { type: "image/jpeg" }));

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=webViewLink,webContentLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Drive rechazó la subida (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { webViewLink?: string; webContentLink?: string };
  return data.webViewLink || data.webContentLink || "";
}
