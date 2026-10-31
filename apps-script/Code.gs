/**
 * Puente entre la app (Vercel) y tu Google Sheet.
 *
 * OPCIÓN B — solo si NO quieres usar una cuenta de servicio.
 *
 * Instalación:
 * 1. Abre tu hoja en Google Sheets (debe ser un Google Sheet nativo:
 *    Archivo → Guardar como Hojas de cálculo de Google).
 * 2. Extensiones → Apps Script.
 * 3. Pega este archivo completo.
 * 4. Ajusta SHEET_ID, TAB y TOKEN.
 * 5. Implementar → Nueva implementación → Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier persona
 * 6. Copia la URL /exec en Vercel como SHEETS_WEBHOOK_URL y el TOKEN como
 *    SHEETS_WEBHOOK_TOKEN.
 */

const SHEET_ID = "1Ezz6wbEu4f3k8h-kpB8HWvcEP6ZYyATHwNddb0NxCvI";
const TAB = "FORMATO DE LIQUIDACION";
const TOKEN = "cambia-este-token-por-uno-largo-y-secreto";

const HEADER_CELLS = ["X2", "B4", "E4", "G4", "I4", "O4", "Q4", "G6", "I6", "N6"];
const FIRST_ROW = 10;
const LAST_ROW = 50;
const COLUMNS = 30; // A..AD

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respond({ ok: false, error: "Sin datos." });
    }

    const body = JSON.parse(e.postData.contents);
    if (String(body.token || "") !== TOKEN) {
      return respond({ ok: false, error: "Token inválido." });
    }

    if (body.action === "read") {
      return respond({ ok: true, data: readAll() });
    }

    if (body.action === "write") {
      const updates = (body.payload && body.payload.updates) || [];
      writeAll(updates);
      return respond({ ok: true, data: readAll() });
    }

    return respond({ ok: false, error: "Acción desconocida." });
  } catch (error) {
    return respond({ ok: false, error: String(error) });
  }
}

function doGet() {
  return respond({ ok: true, data: { status: "activo" } });
}

function readAll() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  if (!sheet) throw new Error("No existe la pestaña " + TAB);

  const headerValues = HEADER_CELLS.map(function (cell) {
    return sheet.getRange(cell).getValue();
  });

  const values = sheet.getRange(FIRST_ROW, 1, LAST_ROW - FIRST_ROW + 1, COLUMNS).getValues();
  const itemRows = [];
  for (let i = 0; i <= LAST_ROW - FIRST_ROW; i += 1) {
    itemRows.push(values[i] || []);
  }

  const totalsValues = sheet
    .getRange("T70:T74")
    .getValues()
    .map(function (row) {
      return row[0];
    });

  return { headerValues: headerValues, itemRows: itemRows, totalsValues: totalsValues };
}

function writeAll(updates) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  if (!sheet) throw new Error("No existe la pestaña " + TAB);

  updates.forEach(function (update) {
    const a1 = String(update.range).split("!")[1];
    if (!a1) return;
    let value = update.values[0][0];

    // Las fechas llegan como YYYY-MM-DD: se convierten a fecha real.
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      value = new Date(value + "T12:00:00");
    }

    sheet.getRange(a1).setValue(value);
  });
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
