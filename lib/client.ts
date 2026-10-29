import jsQR from "jsqr";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* respuesta sin JSON */
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Error ${res.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function compressImage(file: File, maxSide = 1080): Promise<Blob> {
  // 1. Intento rápido con createImageBitmap
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      const origW = bitmap.width;
      const origH = bitmap.height;
      const scale = Math.min(1, maxSide / Math.max(origW, origH));
      const width = Math.round(origW * scale);
      const height = Math.round(origH * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.75)
        );
        if (blob) return blob;
      }
    }
  } catch {
    /* Si falla createImageBitmap, continuamos al fallback */
  }

  // 2. Fallback universal usando elemento Image
  try {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = objectUrl;
    });

    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(origW, origH));
    const width = Math.round(origW * scale);
    const height = Math.round(origH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.75)
      );
      if (blob) return blob;
    }
    URL.revokeObjectURL(objectUrl);
  } catch {
    /* si todo falla, devolver el archivo original */
  }

  return file;
}

/** Escanea si una foto contiene un código QR de SAT / FEL en milisegundos sin internet */
export async function scanQrFromBlob(fileOrBlob: Blob): Promise<string | null> {
  try {
    const objectUrl = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = objectUrl;
    });

    const maxSide = 1200;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const width = Math.round((img.naturalWidth || img.width) * scale);
    const height = Math.round((img.naturalHeight || img.height) * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      URL.revokeObjectURL(objectUrl);
      return null;
    }

    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(objectUrl);

    const imageData = ctx.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, width, height, {
      inversionAttempts: "attemptBoth",
    });

    return code ? code.data : null;
  } catch {
    return null;
  }
}

export function money(value: string | number | null | undefined): string {
  const num = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(num)) return "Q 0.00";
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatDate(value: string): string {
  if (!value) return "Sin fecha";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
