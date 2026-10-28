"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export default function LoginForm({ passcodeRequired }: { passcodeRequired: boolean }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-brand-700 via-brand-700 to-brand-900 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3 text-white">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100">
              Formato de liquidación
            </p>
            <h1 className="text-lg font-semibold">Viáticos · Supervisión</h1>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-900">Entrar</h2>
          <p className="mt-1 text-sm text-slate-500">
            {passcodeRequired
              ? "Escribe el código de acceso para llenar el formato."
              : "No hay código configurado en este entorno."}
          </p>

          {passcodeRequired && (
            <div className="mt-5">
              <label className="field-label" htmlFor="passcode">
                Código de acceso
              </label>
              <input
                id="passcode"
                type="password"
                autoComplete="current-password"
                className="field-input"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                autoFocus
              />
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-brand-100">
          Los datos se guardan directamente en tu Google Sheet.
        </p>
      </div>
    </div>
  );
}
