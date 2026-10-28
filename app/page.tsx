import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ConfigError from "@/components/ConfigError";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { serviceAccountEmail } from "@/lib/google";
import { ocrEnabled } from "@/lib/ocr";
import { readSheet } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export default async function Page() {
  const store = await cookies();
  if (!verifySessionToken(store.get(SESSION_COOKIE)?.value)) {
    redirect("/login");
  }

  try {
    const data = await readSheet();
    return (
      <AppShell
        initial={data}
        ocrEnabled={ocrEnabled()}
        serviceAccountEmail={serviceAccountEmail()}
      />
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo leer la hoja de cálculo.";
    return <ConfigError message={message} />;
  }
}
