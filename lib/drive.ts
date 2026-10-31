import { getAccessToken } from "./google";

export type DriveUpload = {
  id: string;
  name: string;
  url: string;
};

const DATA_URL = /^data:([^;]+);base64,/i;

function splitBase64(input: string) {
  const match = input.match(DATA_URL);
  const mimeType = (match?.[1] || "image/jpeg").toLowerCase();
  const base64 = input.replace(DATA_URL, "").replace(/\s/g, "");
  return { mimeType, buffer: Buffer.from(base64, "base64") };
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic")) return "heic";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** Traduce los errores de Drive a algo que se pueda entender en la app. */
function driveError(status: number, payload: unknown): Error {
  const raw =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { message?: string } }).error?.message
      : undefined;
  const detail = raw || `Error ${status} de Google Drive`;

  if (/has not been used in project|it is disabled|accessNotConfigured|drive\.googleapis\.com.*disabled/i.test(detail)) {
    const link = detail.match(/https:\/\/console\.developers\.google\.com\/apis\/api\/[^\s]+/)?.[0];
    return new Error(
      `La API de Google Drive está desactivada en tu proyecto de Google Cloud. Actívala aquí: ${
        link ?? "https://console.cloud.google.com/apis/library/drive.googleapis.com"
      } — espera de 2 a 5 minutos y vuelve a intentar.`
    );
  }
  if (/storage quota/i.test(detail)) {
    return new Error(
      "Google Drive no acepta archivos de la cuenta de servicio (sin cuota). Usa una Unidad compartida de Google Workspace y compártela con la cuenta de servicio."
    );
  }
  if (status === 404) {
    return new Error(
      "No se encontró la carpeta de Google Drive. Revisa GOOGLE_DRIVE_FOLDER_ID y compártela con la cuenta de servicio."
    );
  }
  if (status === 401 || status === 403) {
    return new Error(
      `Google Drive rechazó la subida (${status}). Comparte la carpeta con la cuenta de servicio como Editor. Detalle: ${detail}`
    );
  }
  return new Error(`Google Drive rechazó la subida (${status}): ${detail}`);
}

async function driveFetch(url: string, init: RequestInit, token: string) {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await res.json().catch(() => null);
  return { res, payload };
}

/**
 * Sube una imagen (data URL o base64 puro) a la carpeta configurada en
 * GOOGLE_DRIVE_FOLDER_ID y devuelve el enlace público de visualización.
 */
export async function uploadImageToDrive(
  base64Data: string,
  filename?: string
): Promise<DriveUpload> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) {
    throw new Error("Falta configurar GOOGLE_DRIVE_FOLDER_ID en Vercel.");
  }
  if (!base64Data) {
    throw new Error("No se recibió la fotografía.");
  }

  const { mimeType, buffer } = splitBase64(base64Data);
  if (!buffer.length) {
    throw new Error("La fotografía llegó vacía o dañada.");
  }

  const token = await getAccessToken();
  const cleanName = filename?.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
  const name = cleanName
    ? `${cleanName}.${extensionFor(mimeType)}`
    : `factura_${stamp()}.${extensionFor(mimeType)}`;

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify({ name, parents: [folderId], mimeType })], {
      type: "application/json",
    })
  );
  form.append("file", new Blob([buffer], { type: mimeType }));

  const upload = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink",
    { method: "POST", body: form },
    token
  );

  if (!upload.res.ok) {
    throw driveError(upload.res.status, upload.payload);
  }

  const file = (upload.payload ?? {}) as { id?: string; name?: string; webViewLink?: string };
  if (!file.id) {
    throw new Error("Google Drive no devolvió el identificador del archivo.");
  }

  // Permiso de lectura con enlace: así la foto se puede abrir desde el celular.
  await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}/permissions?supportsAllDrives=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    },
    token
  ).catch(() => undefined);

  let url = file.webViewLink ?? "";
  if (!url) {
    const info = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?fields=webViewLink&supportsAllDrives=true`,
      { method: "GET" },
      token
    ).catch(() => null);
    url =
      (info?.payload as { webViewLink?: string } | null)?.webViewLink ??
      `https://drive.google.com/file/d/${file.id}/view`;
  }

  return { id: file.id, name: file.name ?? name, url };
}
