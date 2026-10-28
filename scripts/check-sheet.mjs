/**
 * Diagnóstico de conexión con Google Sheets.
 *
 * Uso:
 *   1. Guarda el JSON de la cuenta de servicio en la raíz del proyecto
 *      (cualquier *.json que no sea package.json; ya están en .gitignore).
 *   2. npm run check-sheet
 *
 * No escribe nada en la hoja: solo lee. Comprueba credenciales, tipo de
 * archivo, pestañas, permisos y el contenido del encabezado.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SHEET_ID = process.env.SHEET_ID || "1Ezz6wbEu4f3k8h-kpB8HWvcEP6ZYyATHwNddb0NxCvI";
const TAB = process.env.SHEET_TAB || "FORMATO DE LIQUIDACION";
const HEADER_CELLS = ["AB2", "B4", "E4", "G4", "I4", "O4", "Q4", "G6", "I6", "N6"];

function fail(message, hint) {
  console.error(`\n✖ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function loadAccount() {
  const envRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (envRaw) {
    const json = envRaw.startsWith("{") ? envRaw : Buffer.from(envRaw, "base64").toString("utf8");
    return JSON.parse(json);
  }

  const files = fs
    .readdirSync(".")
    .filter((name) => name.endsWith(".json"))
    .filter((name) => !["package.json", "package-lock.json", "tsconfig.json", "vercel.json"].includes(name));

  for (const name of files) {
    const file = path.resolve(name);
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed.client_email && parsed.private_key) return parsed;
    } catch {
      /* archivo no válido, se ignora */
    }
  }

  fail(
    "No encontré las credenciales de la cuenta de servicio.",
    "Guarda el JSON descargado en la raíz del proyecto (por ejemplo service-account.json)."
  );
}

async function getToken(account) {
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;

  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(account.private_key.replace(/\\n/g, "\n"), "base64url");

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    fail(`Google rechazó la cuenta de servicio (${res.status}).`, detail.slice(0, 400));
  }

  return (await res.json()).access_token;
}

async function api(token, pathAndQuery) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SHEET_ID)}${pathAndQuery}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();

  if (!res.ok) {
    if (text.includes("not a Google Sheets file")) {
      fail(
        "El archivo es un Excel (.xlsx) subido a Drive; la API no puede leerlo ni escribirlo.",
        "Abre la hoja → Archivo → Guardar como Hojas de cálculo de Google. Usa el ID de esa copia."
      );
    }
    if (res.status === 403) {
      fail(
        "La cuenta de servicio no tiene permiso sobre la hoja.",
        "Comparte la hoja con el correo de la cuenta de servicio como Editor.\n  Detalle: " +
          text.slice(0, 400)
      );
    }
    if (res.status === 404) {
      fail("No se encontró la hoja con ese ID.", "Revisa SHEET_ID.");
    }
    fail(`Google Sheets respondió ${res.status}.`, text.slice(0, 400));
  }

  return JSON.parse(text);
}

/** Lee varios rangos en una sola llamada (evita el parámetro ?range=). */
async function batchGet(token, ranges) {
  const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", majorDimension: "ROWS" });
  for (const range of ranges) params.append("ranges", range);
  const data = await api(token, `/values:batchGet?${params.toString()}`);
  return data.valueRanges ?? [];
}

const DAY_MS = 86_400_000;
function serialToDate(serial) {
  if (typeof serial !== "number" || serial < 1) return serial;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * DAY_MS).toISOString().slice(0, 10);
}

const account = loadAccount();
console.log(`Cuenta de servicio: ${account.client_email}`);
console.log(`Hoja:              ${SHEET_ID}`);
console.log(`Pestaña esperada:  ${TAB}\n`);

const token = await getToken(account);
console.log("✔ Credenciales válidas (token obtenido)");

const meta = await api(token, "?fields=properties.title,sheets.properties.title");
console.log(`✔ Archivo: ${meta.properties?.title ?? "(sin título)"}`);

const tabs = (meta.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean);
console.log(`  Pestañas: ${tabs.join(" | ")}`);

if (!tabs.includes(TAB)) {
  fail(`No existe la pestaña "${TAB}".`, `Nombres disponibles: ${tabs.join(", ")}. Ajusta SHEET_TAB.`);
}
console.log("✔ La pestaña existe y es accesible");

const headerRanges = HEADER_CELLS.map((cell) => `'${TAB}'!${cell}`);
const [headerRanges2, itemsRange, totalsRange] = await batchGet(token, [
  ...headerRanges,
  `'${TAB}'!A10:AC50`,
  `'${TAB}'!T70:T74`,
]).then((all) => {
  const header = all.slice(0, HEADER_CELLS.length).map((r) => r.values?.[0]?.[0] ?? "");
  return [header, all[HEADER_CELLS.length], all[HEADER_CELLS.length + 1]];
});

const labels = [
  "No. liquidación",
  "Del",
  "Al",
  "Liquidado",
  "Destinos",
  "Transferencia",
  "Cheque",
  "Proyecto",
  "Objeto",
  "Departamento",
];

console.log("✔ Encabezado:");
headerRanges2.forEach((value, index) => {
  const isDate = index >= 1 && index <= 3;
  const shown = isDate ? serialToDate(value) || "(vacío)" : value === "" ? "(vacío)" : value;
  console.log(`   ${HEADER_CELLS[index].padEnd(4)} ${labels[index].padEnd(16)} ${shown}`);
});

const rows = itemsRange?.values ?? [];
const used = rows.filter((row) => row.some((cell) => cell !== "" && cell !== null));
console.log(`✔ Tabla de gastos: ${used.length} fila(s) con datos (filas 10–50)`);
for (const row of used.slice(0, 5)) {
  console.log(
    `   No.${row[0] ?? "?"} · ${row[1] ?? ""} · ${row[14] ?? ""} · Q${row[19] ?? ""}`
  );
}
if (used.length > 5) console.log(`   … y ${used.length - 5} más`);

const totals = (totalsRange?.values ?? []).map((row) => row[0] ?? "");
console.log(
  `✔ Totales: liquidado T70=${totals[0]} | acreditado T71=${totals[1]} | tarjeta T72=${totals[2]} | corte T73=${totals[3] || 0} | diferencia T74=${totals[4]}`
);

console.log("\nTodo listo: la app puede leer y escribir esta hoja.");
