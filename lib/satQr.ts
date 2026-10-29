import type { OcrDocument } from "./types";

/**
 * Parsea el contenido de un código QR de una factura electrónica DTE / FEL de Guatemala.
 */
export function parseGuatemalaQr(rawContent: string): Partial<OcrDocument> {
  const content = rawContent.trim();
  if (!content) return {};

  // Caso 1: Es una URL oficial de la SAT o certificador (Infile, Digifact, Megaprint, etc.)
  if (content.startsWith("http://") || content.startsWith("https://")) {
    try {
      const url = new URL(content);
      const p = url.searchParams;

      // Buscar NIT en los parámetros habituales
      const nit =
        p.get("nit") ||
        p.get("nitemisor") ||
        p.get("emisor") ||
        p.get("NIT") ||
        p.get("nit_emisor") ||
        "";

      // Serie
      const serie = p.get("serie") || p.get("s") || p.get("SERIE") || "";

      // Número o DTE
      const numero =
        p.get("numero") ||
        p.get("num") ||
        p.get("no") ||
        p.get("dte") ||
        p.get("DTE") ||
        p.get("NUMERO") ||
        "";

      // Monto total
      const monto =
        p.get("monto") ||
        p.get("total") ||
        p.get("val") ||
        p.get("MONTO") ||
        p.get("TOTAL") ||
        "";

      // Fecha
      const fechaRaw =
        p.get("fecha") ||
        p.get("f") ||
        p.get("FECHA") ||
        p.get("fechaemision") ||
        "";

      let fecha = new Date().toISOString().split("T")[0];
      if (fechaRaw) {
        // Detectar si viene como YYYYMMDD o YYYY-MM-DD o DD/MM/YYYY
        if (/^\d{8}$/.test(fechaRaw)) {
          fecha = `${fechaRaw.slice(0, 4)}-${fechaRaw.slice(4, 6)}-${fechaRaw.slice(6, 8)}`;
        } else if (/^\d{4}-\d{2}-\d{2}/.test(fechaRaw)) {
          fecha = fechaRaw.slice(0, 10);
        } else if (/^\d{2}\/\d{2}\/\d{4}/.test(fechaRaw)) {
          const [d, m, y] = fechaRaw.split("/");
          fecha = `${y}-${m}-${d}`;
        }
      }

      // Limpieza de valores
      const cleanNit = nit.replace(/[^0-9Kk-]/g, "");
      const cleanMonto = monto.replace(/[^\d.,]/g, "").replace(",", ".");

      if (cleanNit || cleanMonto || serie || numero) {
        return {
          proveedor: "EMISOR DTE (QR SAT)",
          nit: cleanNit,
          serie: serie.toUpperCase(),
          numero: numero.toUpperCase(),
          fecha,
          tipoDoc: "FAC",
          valor: cleanMonto || "0",
          tipoGasto: "Viáticos",
          pais: "GUATEMALA",
          confianza: "alta",
        };
      }
    } catch {
      /* continuar con parseo por delimitadores */
    }
  }

  // Caso 2: Texto plano delimitado por barras (|), punto y coma (;) o comas
  const segments = content.split(/[|;,]/).map((s) => s.trim()).filter(Boolean);

  if (segments.length >= 2) {
    let nit = "";
    let serie = "";
    let numero = "";
    let valor = "";
    let fecha = new Date().toISOString().split("T")[0];

    for (const seg of segments) {
      // Fecha
      if (/^\d{4}-\d{2}-\d{2}$/.test(seg)) {
        fecha = seg;
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(seg)) {
        const [d, m, y] = seg.split("/");
        fecha = `${y}-${m}-${d}`;
      } else if (/^\d{8}$/.test(seg) && (seg.startsWith("202") || seg.startsWith("203"))) {
        fecha = `${seg.slice(0, 4)}-${seg.slice(4, 6)}-${seg.slice(6, 8)}`;
      }
      // Monto con decimales
      else if (/^\d+[.,]\d{2}$/.test(seg)) {
        valor = seg.replace(",", ".");
      }
      // NIT guatemalteco (ej: 1234567-8 o 87654321)
      else if (/^\d{6,10}-?[0-9Kk]?$/.test(seg) && !nit) {
        nit = seg;
      }
      // Serie alfanumérica típica SAT
      else if (!serie && /^[A-F0-9]{8}$/i.test(seg)) {
        serie = seg;
      }
      // Número DTE largo
      else if (!numero && /^\d{6,15}$/.test(seg)) {
        numero = seg;
      }
    }

    if (nit || valor || numero) {
      return {
        proveedor: "EMISOR DTE (QR SAT)",
        nit: nit.replace(/[^0-9Kk-]/g, ""),
        serie: serie.toUpperCase(),
        numero: numero.toUpperCase(),
        fecha,
        tipoDoc: "FAC",
        valor: valor || "0",
        tipoGasto: "Viáticos",
        pais: "GUATEMALA",
        confianza: "alta",
      };
    }
  }

  return {};
}

