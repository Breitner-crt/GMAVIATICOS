export default function ConfigError({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-5 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          No se pudo conectar con el Sheet
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Revisa la configuración</h1>
        <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-600">{message}</p>

        <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-700">Lista rápida:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>La hoja debe ser un Google Sheet nativo (no un .xlsx subido).</li>
            <li>Comparte la hoja con el correo de la cuenta de servicio como Editor.</li>
            <li>Revisa SHEET_ID y SHEET_TAB en Vercel.</li>
            <li>Vuelve a desplegar después de cambiar variables de entorno.</li>
          </ol>
        </div>

        <div className="mt-5 flex gap-2">
          <a href="/" className="btn-primary flex-1">
            Reintentar
          </a>
          <a href="/login" className="btn-secondary flex-1">
            Volver a entrar
          </a>
        </div>
      </div>
    </div>
  );
}
