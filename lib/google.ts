import crypto from "node:crypto";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let cached: { token: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  let json = raw;
  if (!raw.startsWith("{")) {
    json = Buffer.from(raw, "base64").toString("utf8");
  }

  try {
    const parsed = JSON.parse(json) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    return null;
  }
}

export function hasServiceAccount(): boolean {
  return loadServiceAccount() !== null;
}

/** Correo de la cuenta de servicio: es el que se comparte en el Sheet. */
export function serviceAccountEmail(): string | null {
  return loadServiceAccount()?.client_email ?? null;
}

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const account = loadServiceAccount();
  if (!account) {
    throw new Error(
      "Falta configurar GOOGLE_SERVICE_ACCOUNT_JSON en Vercel (o usa SHEETS_WEBHOOK_URL)."
    );
  }

  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);

  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;

  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(account.private_key, "base64url");

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Google rechazó la cuenta de servicio (${res.status}). ${detail.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}
