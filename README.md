# Liquidación de Viáticos — app móvil

Aplicación web (móvil primero, instalable como PWA) para llenar el formato
**FORMATO DE LIQUIDACION** de Google Sheets:

- Escribir a mano los datos del encabezado (filas 1–7).
- Agregar gastos a la tabla (filas 8–74) manualmente **o fotografiando facturas**.
- Revisar y corregir lo que leyó la IA antes de guardar.
- Ver los totales calculados por el propio Sheet.

El frontend vive en GitHub + Vercel. **Lo único que sigue en Google es la hoja de
cálculo.**

---

## 1. Qué escribe y qué no toca

| Zona | Celdas | Cómo se maneja |
| --- | --- | --- |
| Encabezado | `AB2`, `B4`, `E4`, `G4`, `I4`, `O4`, `Q4`, `G6`, `I6`, `N6` | Se escriben celda por celda; `AB2` se genera solo (`2026-001`) |
| Gastos | filas **10–50**, columnas `A B G I K L M N O S T U V X AB AC` | Se escriben celda por celda |
| Totales | `T71` (acreditado) y `T73` (corte) | Se escriben; el resto son fórmulas |
| Fórmulas | `W`, `Y`, `Z`, `AA`, `T70`, `T72`, `T74` | **Nunca se sobrescriben** |
| Filas ocultas | 51–69 | No se tocan |

La app **no inserta ni elimina filas**. Al borrar un gasto se limpian sus celdas y
se renumera la columna `A` para que la numeración quede continua. Esto conserva
combinaciones de celdas, validaciones y fórmulas del formato original.

Capacidad visible: **41 gastos** (filas 10–50).

### Cambiar de hoja sin redesplegar

La hoja activa se guarda en una cookie. En la app, botón **Hoja de cálculo**
(arriba a la derecha):

1. En Google Sheets: **Archivo → Hacer una copia**.
2. Comparte la copia con el correo de la cuenta de servicio como **Editor**
   (el botón *Copiar correo* del panel lo copia).
3. Pega el ID o la URL completa de la copia y pulsa **Probar y usar esta hoja**.

La app verifica el acceso antes de cambiar; si algo falla, te dice qué pasó y
sigue con la hoja anterior. `SHEET_ID` en Vercel solo se usa como valor inicial.

### Nueva liquidación (archivar y limpiar)

En la pestaña **Formulario**, arriba de todo, está el botón **Nueva liquidación**:

1. Pide confirmación mostrando el número, cuántos gastos hay y el total.
2. Duplica la pestaña de trabajo **dentro del mismo archivo** con el nombre
   `LIQ <número> · <fecha del> al <fecha al>`.
3. Deja la pestaña de trabajo en blanco: gastos (filas 10–50), encabezado,
   acreditado y corte.
4. Escribe en `AB2` el número de la **nueva** liquidación.

La copia conserva formato, combinaciones, validaciones y fórmulas (W, Y, Z, AA,
T70, T72, T74), así que las liquidaciones anteriores quedan intactas como
pestañas y se pueden consultar o imprimir desde Google Sheets. Si no hay nada
que archivar (solo el número), no crea una pestaña vacía: únicamente limpia.

### No. de liquidación automático

`AB2` se llena solo con el formato **año + consecutivo**: `2026-001`, `2026-002`…

- El consecutivo se calcula con los nombres de las pestañas ya archivadas
  (`LIQ 2026-001 · …`) y se reinicia cada año.
- Si la liquidación actual no tiene número, se le asigna uno **antes** de
  archivarla, para que la pestaña guardada también quede numerada.
- Si escribes un número a mano, se respeta ese valor y el consecutivo sigue
  desde el mayor que exista.
- Al guardar el encabezado con el campo vacío, también se genera el número.

> El archivado necesita la cuenta de servicio (no funciona con el webhook de
> Apps Script, que no puede crear pestañas).

En el panel **Hoja de cálculo** queda además **Borrar sin archivar**, solo para
descartar lo que hay ahora sin guardar copia. Pide escribir `BORRAR` y nunca toca
las fórmulas.

---

## 2. Ejecutar en tu computadora

Requisitos: Node.js 20 o superior.

```bash
npm install
cp .env.example .env.local   # en Windows: copy .env.example .env.local
npm run dev
```

Abre <http://localhost:3000>.

### Modo demostración

Si no hay credenciales de Google, la app arranca en **modo demostración**: usa
datos falsos en memoria y muestra una franja amarilla de advertencia. Sirve para
probar la interfaz sin tocar tu hoja. Se activa/desactiva con `DEMO_MODE=1` / `0`.

Para el modo demo local ya hay un archivo `.env.local` con:

```
APP_PASSCODE=prueba123
APP_SECRET=desarrollo-local-clave-larga-1234567890
DEMO_MODE=1
```

> Ese archivo es solo para tu computadora (está en `.gitignore`). **No lo subas a
> GitHub** y usa otro código en producción.

---

## 3. Conectar la hoja (Opción A, recomendada)

### 3.1 Preparar la hoja

1. Abre la hoja compartida. Si la URL tiene `rtpof=true`, es un `.xlsx` subido a
   Drive y la API de Sheets **no puede escribirla**.
2. En Google Sheets: **Archivo → Guardar como Hojas de cálculo de Google**.
3. Usa esa copia nativa y copia su ID de la URL:
   `https://docs.google.com/spreadsheets/d/`**`ESTE_ES_EL_ID`**`/edit`
4. Verifica que la pestaña se llame exactamente `FORMATO DE LIQUIDACION`.

### 3.2 Crear la cuenta de servicio

1. Entra a <https://console.cloud.google.com/> y crea un proyecto (o usa uno).
2. **APIs y servicios → Biblioteca** → habilita **Google Sheets API**.
3. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
4. Crea la cuenta (no necesita roles de proyecto) y entra a ella.
5. **Claves → Agregar clave → Crear clave nueva → JSON**. Se descarga un archivo.
6. Copia el correo `client_email` que aparece dentro del JSON.
7. En Google Sheets: **Compartir** → pega ese correo → permiso **Editor**.

### 3.3 Variables en Vercel

En **Project → Settings → Environment Variables** agrega:

| Variable | Valor |
| --- | --- |
| `APP_PASSCODE` | Código de acceso que tú elijas (largo) |
| `APP_SECRET` | Cadena aleatoria de 32+ caracteres |
| `SHEET_ID` | ID de la hoja nativa |
| `SHEET_TAB` | `FORMATO DE LIQUIDACION` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | El JSON completo de la cuenta de servicio |
| `GEMINI_API_KEY` | Clave de Google AI Studio (para leer fotos) |
| `GEMINI_MODEL` | `gemini-2.5-flash` (opcional) |

`GOOGLE_SERVICE_ACCOUNT_JSON` puede pegarse tal cual (una línea) o en base64:

```bash
# macOS / Linux
base64 -w0 cuenta-servicio.json
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cuenta-servicio.json"))
```

Después de cambiar variables hay que **volver a desplegar** (Redeploy).

---

## 4. Conectar la hoja (Opción B, Apps Script)

Úsala si no quieres crear una cuenta de servicio.

1. Abre la hoja nativa → **Extensiones → Apps Script**.
2. Pega el contenido de [`apps-script/Code.gs`](apps-script/Code.gs).
3. Ajusta `SHEET_ID`, `TAB` y `TOKEN` (token largo y secreto).
4. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
5. Copia la URL que termina en `/exec`.
6. En Vercel configura:

| Variable | Valor |
| --- | --- |
| `SHEETS_WEBHOOK_URL` | URL `/exec` |
| `SHEETS_WEBHOOK_TOKEN` | El mismo `TOKEN` del script |

Si `SHEETS_WEBHOOK_URL` existe, la app usa el webhook aunque también haya cuenta
de servicio.

---

## 5. Leer fotos con IA (Gemini)

1. Entra a <https://aistudio.google.com/apikey> y crea una clave.
2. Guárdala en Vercel como `GEMINI_API_KEY`.
3. La clave **nunca** llega al navegador: la llamada sale del servidor.

Sin esta clave la app sigue funcionando; simplemente se oculta el botón de foto
y los gastos se agregan a mano.

Consejos para mejores lecturas: buena luz, factura completa dentro del cuadro,
sin sombras ni reflejos, cámara paralela al papel. Si la factura es manuscrita, la
IA marca confianza `media` o `baja`; revisa esos campos antes de guardar.

---

## 6. Publicar en GitHub y Vercel

El proyecto **no** es todavía un repositorio. Desde `liquidacion-app`:

```bash
git init
git add .
git commit -m "App de liquidación de viáticos"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/liquidacion-viaticos.git
git push -u origin main
```

Crea el repositorio vacío en GitHub antes del `push` (sin README, sin .gitignore).

Luego en Vercel:

1. <https://vercel.com/new> → **Import Git Repository** → elige el repo.
2. Framework: **Next.js** (se detecta solo). No cambies build ni output.
3. Agrega las variables de entorno de la sección 3.3.
4. **Deploy**.

En el celular, abre la URL de Vercel y usa **Agregar a pantalla de inicio**
(Safari: Compartir → Añadir a pantalla de inicio; Chrome: menú → Instalar app).

> Nota: el repo debe estar en la **raíz** del proyecto Next.js. Si subes una
> carpeta contenedora, configura *Root Directory* en Vercel.

---

## 7. Cómo se usa

1. **Entrar** con el código de acceso.
2. Pestaña **Formulario**: No. de liquidación, fechas, destinos, proyecto, objeto,
   departamento, transferencia y cheque → *Guardar datos generales*.
3. Pestaña **Gastos**:
   - **Capturar factura con foto** → toma o elige la imagen → espera la lectura →
     revisa/corrige cada documento → *Agregar al formato*.
   - **+ Nuevo gasto** para capturar a mano.
   - Toca un gasto para editarlo o eliminarlo.
4. Pestaña **Totales**: escribe el monto acreditado y el corte → *Guardar totales*.
   El total liquidado, los gastos con tarjeta y la diferencia los calcula el Sheet.

El botón de recarga (arriba a la derecha) vuelve a leer la hoja por si alguien la
editó desde Google.

### Cálculos que hace el Sheet

- `W` IDP: `D → galones × 1.3`, `R → × 4.6`, `S → × 4.7`.
- `Y` valor neto, `Z` base, `AA` IVA: según `I` (`FAC` / `FPC` / `REC`) e INGUAT.
- `T70` suma de gastos, `T72 = T71 − T73`, `T74 = T72 − T70`.

La app solo escribe las entradas; los resultados siempre vienen de las fórmulas
del formato.

---

## 8. Estructura

```
app/
  page.tsx              Pantalla principal (server component)
  login/page.tsx        Entrada con código
  api/auth/route.ts     Iniciar / cerrar sesión
  api/sheet/route.ts    Leer la hoja
  api/header/route.ts   Guardar encabezado
  api/items/route.ts    Agregar / editar / borrar gastos
  api/totals/route.ts   Guardar acreditado y corte
  api/config/route.ts   Hoja activa y vaciar el formato
  api/new-liquidation/route.ts  Archivar la actual y dejar el formato en blanco
  api/ocr/route.ts      Leer fotografía con Gemini
components/
  AppShell.tsx          Interfaz con pestañas y modales
  PhotoModal.tsx        Cámara, revisión y carga de documentos
  NewLiquidation.tsx    Confirmar «Nueva liquidación» (archiva y limpia)
  SheetSettings.tsx     Cambiar de hoja y borrar sin archivar
  ItemFields.tsx        Campos de un gasto
  LoginForm.tsx         Formulario de acceso
  ConfigError.tsx       Pantalla de error de configuración
lib/
  sheets.ts             Sheets API, webhook y modo demo
  schema.ts             Mapa de celdas, filas, fechas y totales
  google.ts             JWT de la cuenta de servicio
  ocr.ts                Prompt, esquema y normalización de Gemini
  demo.ts               Datos falsos en memoria
  auth.ts               Cookie de sesión firmada
  client.ts             fetch, compresión de imágenes, formato
middleware.ts           Protege todas las rutas
apps-script/Code.gs     Opción B (webhook)
scripts/check-sheet.mjs Diagnóstico de conexión (npm run check-sheet)
```

---

## 9. Problemas comunes

| Síntoma | Causa y solución |
| --- | --- |
| «El archivo es un Excel subido a Drive…» | La hoja es `.xlsx`. Usa **Archivo → Guardar como Hojas de cálculo de Google** y actualiza `SHEET_ID`. |
| «La cuenta de servicio no tiene permiso» | Comparte la hoja con el `client_email` como **Editor**. |
| «No se encontró la hoja» | `SHEET_ID` incorrecto o `SHEET_TAB` no coincide con el nombre de la pestaña. |
| Los cambios no aparecen | Cambiaste variables y no hiciste **Redeploy**. |
| Franja amarilla «Modo demostración» | Faltan credenciales. Revisa `GOOGLE_SERVICE_ACCOUNT_JSON` o `SHEETS_WEBHOOK_URL`. |
| «Falta GEMINI_API_KEY» | Agrega la clave en Vercel y redespliega. |
| La foto se lee mal | Mejora la luz y el encuadre; corrige a mano en la vista previa. |
| «Sesión expirada» | El código cambió o pasaron 30 días. Vuelve a entrar. |
| «No hay filas libres…» | La tabla (filas 10–50) está llena. Pulsa **Nueva liquidación** (archiva la actual y limpia el formato) o cambia de hoja desde el panel **Hoja de cálculo**. |
| «Con el webhook de Apps Script no se pueden crear pestañas» | El archivado automático necesita la cuenta de servicio. Cambia a la Opción A. |
| La pestaña archivada no aparece | Recarga la hoja en Google Sheets; se crea al final del archivo con el nombre `LIQ …`. |
| El webhook no responde JSON | La implementación no está publicada con acceso **Cualquier persona**. |
| Se borró una fórmula | Restaura esa fila desde el historial de versiones del Sheet. La app nunca escribe `W`, `Y`, `Z`, `AA` ni `T70/T72/T74`. |

---

## 10. Seguridad

- El código de acceso se valida en el servidor; la sesión es una cookie
  `HttpOnly` firmada con HMAC (`APP_SECRET`).
- `GOOGLE_SERVICE_ACCOUNT_JSON` y `GEMINI_API_KEY` solo existen en el servidor.
- Cambia `APP_PASSCODE` y `APP_SECRET` antes de publicar. No reutilices
  `prueba123`.
- Si una clave se filtra: revócala en Google Cloud / AI Studio, genera otra y
  actualiza Vercel.
