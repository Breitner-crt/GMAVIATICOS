/**
 * Puente de FOTOS entre la app (Vercel) y tu Google Drive.
 *
 * La cuenta de servicio no tiene cuota de Drive, así que este script guarda las
 * fotos con TU cuenta (la dueña del Drive).
 *
 * Instalación:
 * 1. https://script.google.com → "Nuevo proyecto" → pega este archivo.
 * 2. Ajusta TOKEN (palabra larga y secreta).
 *    - FOLDER_ID: déjalo vacío ("") y el script usará/creará la carpeta
 *      CARPETA_NOMBRE dentro de tu Drive. Si quieres otra carpeta, pega su ID
 *      (el texto después de /folders/ en la URL de Drive).
 * 3. Ejecuta la función `probar` una vez (menú Ejecutar) y revisa el registro:
 *    te dice con qué cuenta corre y qué carpeta usará.
 * 4. Implementar → Nueva implementación → Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier persona
 * 5. Copia la URL /exec en Vercel como PHOTO_UPLOAD_URL y el TOKEN como
 *    PHOTO_UPLOAD_TOKEN.
 *
 * Si cambias el código después, entra a Implementar → Administrar
 * implementaciones → lápiz → Versión: "Nueva versión" → Implementar.
 */

var FOLDER_ID = ""; // opcional: ID exacto de la carpeta destino
var CARPETA_NOMBRE = "Liquidaciones GMA";
var TOKEN = "cambia-este-token-por-uno-largo-y-secreto";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respond({ ok: false, error: "Sin datos." });
    }

    var body = JSON.parse(e.postData.contents);

    if (String(body.token || "") !== TOKEN) {
      return respond({ ok: false, error: "Token inválido." });
    }

    var data = String(body.data || "").replace(/^data:[^;]+;base64,/, "");
    if (!data) {
      return respond({ ok: false, error: "No se recibió la fotografía." });
    }

    var mimeType = body.mimeType || "image/jpeg";
    var filename = String(body.filename || "factura_" + Date.now());
    var folder = getFolder();

    var blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, filename);
    var file = folder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareError) {
      // Si el dominio no permite compartir con enlace, la foto igual queda guardada.
    }

    return respond({
      ok: true,
      id: file.getId(),
      name: file.getName(),
      url: "https://drive.google.com/file/d/" + file.getId() + "/view",
    });
  } catch (error) {
    return respond({ ok: false, error: String(error) });
  }
}

function doGet() {
  var info = { status: "activo", cuenta: cuentaActual() };
  try {
    var folder = getFolder();
    info.carpeta = folder.getName();
    info.carpetaId = folder.getId();
  } catch (error) {
    info.carpetaError = String(error);
  }
  return respond({ ok: true, data: info });
}

/** Ejecuta esta función a mano para comprobar la configuración. */
function probar() {
  var folder = getFolder();
  Logger.log("Cuenta: " + cuentaActual());
  Logger.log("Carpeta: " + folder.getName());
  Logger.log("ID de carpeta: " + folder.getId());
  Logger.log("Enlace: " + folder.getUrl());
}

function cuentaActual() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  } catch (error) {
    return "";
  }
}

function getFolder() {
  if (FOLDER_ID) {
    try {
      return DriveApp.getFolderById(FOLDER_ID);
    } catch (error) {
      throw new Error(
        "No se encontró la carpeta con ID " +
          FOLDER_ID +
          ". Revisa que el ID sea el correcto (texto después de /folders/ en la URL de Drive), que la carpeta no esté en la papelera y que la cuenta que ejecuta el script sea su dueña. Alternativa: deja FOLDER_ID vacío para usar/crear la carpeta \"" +
          CARPETA_NOMBRE +
          "\"."
      );
    }
  }

  var folders = DriveApp.getFoldersByName(CARPETA_NOMBRE);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(CARPETA_NOMBRE);
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
