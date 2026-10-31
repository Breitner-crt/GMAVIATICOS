import {
  archiveAlimentacion,
  readAlimentacion,
  saveAlimentacionDay,
  saveAlimentacionNames,
  saveAlimentacionSetup,
} from "@/lib/alimentacion";
import { jsonError } from "@/lib/http";
import { MEAL_KEYS } from "@/lib/types";
import type { MealKey } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await readAlimentacion());
  } catch (error) {
    return jsonError(error);
  }
}

function mealFrom(value: unknown): MealKey {
  const meal = String(value ?? "") as MealKey;
  if (!MEAL_KEYS.includes(meal)) throw new Error("Tiempo de comida inválido.");
  return meal;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error("Costo inválido.");
  return num;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "day") {
      return Response.json(
        await saveAlimentacionDay({
          meal: mealFrom(body.meal),
          index: Number(body.index),
          cuadrilla: String(body.cuadrilla ?? ""),
          supervisor: String(body.supervisor ?? ""),
        })
      );
    }

    if (action === "setup") {
      const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
      return Response.json(
        await saveAlimentacionSetup({
          meal: mealFrom(body.meal),
          startDate: has("startDate") ? String(body.startDate ?? "") : undefined,
          costCuadrilla: has("costCuadrilla")
            ? optionalNumber(body.costCuadrilla)
            : undefined,
          costSupervisor: has("costSupervisor")
            ? optionalNumber(body.costSupervisor)
            : undefined,
        })
      );
    }

    if (action === "names") {
      return Response.json(
        await saveAlimentacionNames({
          workers: Array.isArray(body.workers) ? body.workers.map(String) : [],
          supervisor: String(body.supervisor ?? ""),
        })
      );
    }

    if (action === "archive") {
      return Response.json(await archiveAlimentacion());
    }

    throw new Error("Acción no reconocida.");
  } catch (error) {
    return jsonError(error);
  }
}
