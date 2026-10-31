/**
 * Puente de FOTOS entre la app (Vercel) y tu Google Drive.
 *
 * ¿Para qué sirve? La cuenta de servicio de Google no tiene cuota de
 * almacenamiento propia, así que Google rechaza los archivos que sube a un
 * Drive personal. Este script se ejecuta como TU cuenta (la dueña del Drive),
 * por lo que las fotos sí se guardan en tu carpeta.
 *
 * Instalación (5 minutos):
 * 1. Entra a https://script.google.com → "Nuevo proyecto".
 * 2. Borra el contenido y pega este archivo completo.
 * 3. Ajusta FOLDER_ID (la carpeta donde quieres las fotos) y TOKEN
 *    (inventa una palabra larga y secreta).
 * 4. Implementar → Nueva implementación → Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier persona
 * 5. Autoriza los permisos que pida Google.
 * 6. Copia la URL que termina en /exec y guárdala en Vercel como
 *    PHOTO_UPLOAD_URL. Guarda el TOKEN como PHOTO_UPLOAD_TOKEN.
 */

var FOLDER_ID = "1ReHTNlVdKjmE_2e1whF82Aon8aRFJoe";
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

    var blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, filename);
    var file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);

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
  return respond({ ok: true, data: { status: "activo" } });
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
