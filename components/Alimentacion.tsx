"use client";

import { useEffect, useMemo, useState } from "react";
import { api, formatDate, money } from "@/lib/client";
import { MEAL_KEYS, MEAL_LABELS } from "@/lib/types";
import type { AlimentacionData, MealKey } from "@/lib/types";

type DayDraft = { cuadrilla: string; supervisor: string };
type Toast = { text: string; type: "ok" | "error" };

const WEEK_LABELS = ["Semana 1", "Semana 2", "Semana 3", "Semana 4", "Semana 5"];

function draftKey(meal: MealKey, index: number) {
  return `${meal}:${index}`;
}

function buildDrafts(data: AlimentacionData): Record<string, DayDraft> {
  const drafts: Record<string, DayDraft> = {};
  for (const key of MEAL_KEYS) {
    for (const day of data.meals[key].days) {
      drafts[draftKey(key, day.index)] = {
        cuadrilla: day.cuadrilla,
        supervisor: day.supervisor,
      };
    }
  }
  return drafts;
}

function numText(value: number | null): string {
  return value === null ? "" : String(value);
}

function dayLabel(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-GT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

export default function Alimentacion() {
  const [data, setData] = useState<AlimentacionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meal, setMeal] = useState<MealKey>("desayuno");
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [workersText, setWorkersText] = useState("");
  const [supervisorText, setSupervisorText] = useState("");
  const [dateDraft, setDateDraft] = useState<Record<MealKey, string>>({
    desayuno: "",
    almuerzo: "",
    cena: "",
  });
  const [costDraft, setCostDraft] = useState<
    Record<MealKey, { cuadrilla: string; supervisor: string }>
  >({
    desayuno: { cuadrilla: "", supervisor: "" },
    almuerzo: { cuadrilla: "", supervisor: "" },
    cena: { cuadrilla: "", supervisor: "" },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(text: string, type: "ok" | "error" = "ok") {
    setToast({ text, type });
  }

  function hydrate(next: AlimentacionData) {
    setData(next);
    setDrafts(buildDrafts(next));
    setWorkersText(next.workers.join("\n"));
    setSupervisorText(next.supervisor);
    setDateDraft({
      desayuno: next.meals.desayuno.startDate,
      almuerzo: next.meals.almuerzo.startDate,
      cena: next.meals.cena.startDate,
    });
    setCostDraft({
      desayuno: {
        cuadrilla: numText(next.meals.desayuno.costCuadrilla),
        supervisor: numText(next.meals.desayuno.costSupervisor),
      },
      almuerzo: {
        cuadrilla: numText(next.meals.almuerzo.costCuadrilla),
        supervisor: numText(next.meals.almuerzo.costSupervisor),
      },
      cena: {
        cuadrilla: numText(next.meals.cena.costCuadrilla),
        supervisor: numText(next.meals.cena.costSupervisor),
      },
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      hydrate(await api<AlimentacionData>("/api/alimentacion"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el módulo de alimentación."
      );
    } finally {
      setLoading(false);
    }
  }

  function setDayValue(
    key: MealKey,
    index: number,
    field: "cuadrilla" | "supervisor",
    value: string
  ) {
    const clean = value.replace(/[^0-9.,-]/g, "");
    setDrafts((prev) => ({
      ...prev,
      [draftKey(key, index)]: {
        ...(prev[draftKey(key, index)] ?? { cuadrilla: "", supervisor: "" }),
        [field]: clean,
      },
    }));
  }

  async function saveDay(key: MealKey, index: number) {
    if (!data) return;
    const draft = drafts[draftKey(key, index)];
    const day = data.meals[key].days[index];
    if (!draft || !day) return;
    if (draft.cuadrilla === day.cuadrilla && draft.supervisor === day.supervisor) return;

    const id = `day:${key}:${index}`;
    setBusy(id);
    try {
      const next = await api<AlimentacionData>("/api/alimentacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "day",
          meal: key,
          index,
          cuadrilla: draft.cuadrilla,
          supervisor: draft.supervisor,
        }),
      });
      const saved = next.meals[key].days[index];
      setData(next);
      setDrafts((prev) => ({
        ...prev,
        [draftKey(key, index)]: {
          cuadrilla: saved.cuadrilla,
          supervisor: saved.supervisor,
        },
      }));
      notify("Cantidades guardadas.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se guardaron las cantidades.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveSetup() {
    if (!data) return;
    const id = `setup:${meal}`;
    setBusy(id);
    try {
      const next = await api<AlimentacionData>("/api/alimentacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setup",
          meal,
          startDate: dateDraft[meal],
          costCuadrilla:
            costDraft[meal].cuadrilla === "" ? null : Number(costDraft[meal].cuadrilla),
          costSupervisor:
            costDraft[meal].supervisor === "" ? null : Number(costDraft[meal].supervisor),
        }),
      });
      setData(next);
      setDateDraft((prev) => ({ ...prev, [meal]: next.meals[meal].startDate }));
      setCostDraft((prev) => ({
        ...prev,
        [meal]: {
          cuadrilla: numText(next.meals[meal].costCuadrilla),
          supervisor: numText(next.meals[meal].costSupervisor),
        },
      }));
      notify("Fecha y costos guardados.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se guardó la configuración.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveNames() {
    const workers = workersText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const id = "names";
    setBusy(id);
    try {
      const next = await api<AlimentacionData>("/api/alimentacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "names",
          workers,
          supervisor: supervisorText,
        }),
      });
      setData(next);
      setWorkersText(next.workers.join("\n"));
      setSupervisorText(next.supervisor);
      notify("Nombres guardados en la columna J.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se guardaron los nombres.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function archive() {
    if (
      !window.confirm(
        "¿Archivar este periodo en una pestaña nueva y dejar la pestaña de trabajo limpia?"
      )
    ) {
      return;
    }
    setBusy("archive");
    try {
      const result = await api<{ data: AlimentacionData; archivedAs: string }>(
        "/api/alimentacion",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "archive" }),
        }
      );
      hydrate(result.data);
      notify(
        result.archivedAs
          ? `Periodo archivado como «${result.archivedAs}».`
          : "Pestaña limpia para un periodo nuevo."
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo archivar.", "error");
    } finally {
      setBusy(null);
    }
  }

  const block = data?.meals[meal] ?? null;

  const workersParsed = useMemo(
    () =>
      workersText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    [workersText]
  );

  const namesDirty = data
    ? workersParsed.join("\n") !== data.workers.join("\n") ||
      supervisorText.trim() !== data.supervisor
    : false;

  const setupDirty = data && block
    ? dateDraft[meal] !== block.startDate ||
      costDraft[meal].cuadrilla !== numText(block.costCuadrilla) ||
      costDraft[meal].supervisor !== numText(block.costSupervisor)
    : false;

  if (loading) {
    return (
      <div className="card px-4 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">Cargando alimentación…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card space-y-3 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-red-700">No se pudo abrir Alimentación</p>
        <p className="text-xs text-slate-600">{error}</p>
        <button type="button" onClick={load} className="btn-secondary">
          Reintentar
        </button>
      </div>
    );
  }

  if (!data || !block) return null;

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Alimentación</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{data.meta.tab}</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={busy !== null}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            aria-label="Recargar alimentación"
            title="Recargar desde el Sheet"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {MEAL_KEYS.map((key) => {
            const item = data.meals[key];
            const active = key === meal;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMeal(key)}
                className={`rounded-xl border px-2.5 py-2.5 text-left transition ${
                  active
                    ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500/30"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {MEAL_LABELS[key]}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">{money(item.total)}</p>
                <p className="text-[10px] text-slate-500">
                  {item.totalCuadrilla + item.totalSupervisor} servicios
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{block.label}</h3>
          <span className="chip bg-slate-100 text-slate-600">
            {block.startDate ? formatDate(block.startDate) : "Sin fecha"}
          </span>
        </div>

        <div>
          <label className="field-label" htmlFor={`alim-date-${meal}`}>
            Primera fecha (el resto del mes se calcula solo)
          </label>
          <input
            id={`alim-date-${meal}`}
            type="date"
            className="field-input"
            value={dateDraft[meal]}
            onChange={(event) =>
              setDateDraft((prev) => ({ ...prev, [meal]: event.target.value }))
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor={`alim-cost-c-${meal}`}>
              Costo cuadrilla (Q)
            </label>
            <input
              id={`alim-cost-c-${meal}`}
              type="number"
              inputMode="decimal"
              step="any"
              className="field-input"
              placeholder="0.00"
              value={costDraft[meal].cuadrilla}
              onChange={(event) =>
                setCostDraft((prev) => ({
                  ...prev,
                  [meal]: { ...prev[meal], cuadrilla: event.target.value },
                }))
              }
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`alim-cost-s-${meal}`}>
              Costo supervisor (Q)
            </label>
            <input
              id={`alim-cost-s-${meal}`}
              type="number"
              inputMode="decimal"
              step="any"
              className="field-input"
              placeholder="0.00"
              value={costDraft[meal].supervisor}
              onChange={(event) =>
                setCostDraft((prev) => ({
                  ...prev,
                  [meal]: { ...prev[meal], supervisor: event.target.value },
                }))
              }
            />
          </div>
        </div>

        <button
          type="button"
          onClick={saveSetup}
          disabled={!setupDirty || busy === `setup:${meal}`}
          className="btn-primary w-full"
        >
          {busy === `setup:${meal}` ? "Guardando…" : "Guardar fecha y costos"}
        </button>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Cantidades por día</h3>
          <span className="text-[11px] text-slate-500">
            {block.totalCuadrilla} cuadrilla · {block.totalSupervisor} supervisor
          </span>
        </div>

        <div className="px-3 py-3">
          <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Fecha</span>
            <span className="text-center">Cuadrilla</span>
            <span className="text-center">Supervisor</span>
          </div>

          {WEEK_LABELS.map((label, week) => (
            <div key={label} className="mb-3 last:mb-0">
              <p className="mb-1 px-1 text-[11px] font-semibold text-brand-700">{label}</p>
              <div className="space-y-1.5">
                {block.days
                  .slice(week * 7, week * 7 + 7)
                  .map((day) => {
                    const draft =
                      drafts[draftKey(meal, day.index)] ?? {
                        cuadrilla: day.cuadrilla,
                        supervisor: day.supervisor,
                      };
                    const saving = busy === `day:${meal}:${day.index}`;
                    return (
                      <div
                        key={day.index}
                        className={`grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2 rounded-lg px-1 py-0.5 ${
                          saving ? "opacity-60" : ""
                        }`}
                      >
                        <span
                          className={`truncate text-xs ${
                            day.date ? "text-slate-600" : "text-slate-400"
                          }`}
                        >
                          {dayLabel(day.date)}
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="field-input px-2 py-1.5 text-center text-sm"
                          placeholder="0"
                          aria-label={`Cuadrilla ${dayLabel(day.date)}`}
                          value={draft.cuadrilla}
                          onChange={(event) =>
                            setDayValue(meal, day.index, "cuadrilla", event.target.value)
                          }
                          onBlur={() => saveDay(meal, day.index)}
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          className="field-input px-2 py-1.5 text-center text-sm"
                          placeholder="0"
                          aria-label={`Supervisor ${dayLabel(day.date)}`}
                          value={draft.supervisor}
                          onChange={(event) =>
                            setDayValue(meal, day.index, "supervisor", event.target.value)
                          }
                          onBlur={() => saveDay(meal, day.index)}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Nombres (columna J)</h3>
          <span className="chip bg-slate-100 text-slate-600">
            {data.workers.length} trabajadores
          </span>
        </div>

        <div>
          <label className="field-label" htmlFor="alim-workers">
            Trabajadores (uno por línea)
          </label>
          <textarea
            id="alim-workers"
            rows={Math.max(3, Math.min(8, data.workers.length || 3))}
            className="field-input resize-y"
            placeholder={"Juan Pérez\nMaría López"}
            value={workersText}
            onChange={(event) => setWorkersText(event.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="alim-supervisor">
            Supervisor
          </label>
          <input
            id="alim-supervisor"
            type="text"
            className="field-input"
            placeholder="Nombre del supervisor"
            value={supervisorText}
            onChange={(event) => setSupervisorText(event.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={saveNames}
          disabled={!namesDirty || busy === "names"}
          className="btn-primary w-full"
        >
          {busy === "names" ? "Guardando…" : "Guardar nombres"}
        </button>
        <p className="text-[11px] text-slate-500">
          Los trabajadores y el supervisor se escriben en la columna J, cada uno en su
          propia fila.
        </p>
      </section>

      <section className="card space-y-3 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Archivar periodo</h3>
        <p className="text-xs text-slate-500">
          Guarda una copia de esta pestaña con los datos del periodo y deja las cantidades
          y los nombres en blanco. Los costos y las fechas se conservan.
        </p>
        <button
          type="button"
          onClick={archive}
          disabled={busy === "archive"}
          className="btn-secondary w-full"
        >
          {busy === "archive" ? "Archivando…" : "Archivar y dejar limpia"}
        </button>
      </section>

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-lg ${
            toast.type === "error" ? "bg-red-700 text-white" : "bg-slate-900 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
