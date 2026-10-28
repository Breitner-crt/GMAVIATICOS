import crypto from "node:crypto";

export const SESSION_COOKIE = "lv_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function secret(): string {
  return (
    process.env.APP_SECRET?.trim() ||
    process.env.APP_PASSCODE?.trim() ||
    "dev-secret-cambiar-en-produccion"
  );
}

export function createSessionToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE * 1000 })
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function checkPasscode(input: string): boolean {
  const expected = process.env.APP_PASSCODE?.trim();
  if (!expected) return true; // sin código configurado no se bloquea (solo desarrollo)
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hasPasscode(): boolean {
  return Boolean(process.env.APP_PASSCODE?.trim());
}
