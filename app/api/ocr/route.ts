import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import { NextResponse } from "next/server";
import type { OcrDocument } from "@/lib/types";

function getClient(processorName: string) {
  const credentialsEnv = process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS;
  if (!credentialsEnv) {
    throw new Error("Falta la variable de entorno GOOGLE_DOCUMENT_AI_CREDENTIALS");
  }
  
  const locationMatch = processorName.match(/locations\/([a-z0-9-]+)/i);
  const location = locationMatch ? locationMatch[1] : "us";
  const apiEndpoint = `${location}-documentai.googleapis.com`;

  try {
    const credentials = JSON.parse(credentialsEnv);
    return {
      client: new DocumentProcessorServiceClient({ 
        credentials,
        apiEndpoint,
        fallback: true
      }),
      projectId: credentials.project_id,
      location
    };
  } catch (e) {
    throw new Error("El JSON de GOOGLE_DOCUMENT_AI_CREDENTIALS es inválido.");
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No se encontró ningún archivo" }, { status: 400 });
    }

    let processorName = process.env.DOCUMENT_AI_PROCESSOR_NAME || "";
    if (!processorName) {
      return NextResponse.json({ error: "Falta la variable DOCUMENT_AI_PROCESSOR_NAME" }, { status: 500 });
    }

    const { client, projectId, location } = getClient(processorName);

    // Si el usuario solo puso el ID (ej: b873c328791218cb), construimos la ruta completa automáticamente
    if (!processorName.includes("/")) {
      processorName = `projects/${projectId}/locations/${location}/processors/${processorName}`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const encodedImage = Buffer.from(arrayBuffer).toString("base64");

    const request = {
      name: processorName,
      rawDocument: {
        content: encodedImage,
        mimeType: file.type || "image/jpeg",
      },
    };

    const [result] = await client.processDocument(request);
    const entities = result.document?.entities || [];

    const getEntityText = (type: string) => {
      const entity = entities.find(e => e.type === type);
      return entity?.mentionText || "";
    };

    const proveedor = getEntityText("supplier_name") || "ESTABLECIMIENTO";
    const nit = getEntityText("supplier_tax_id").replace(/[^0-9Kk]/gi, "") || "";
    const serie = getEntityText("invoice_id") || "";
    const numero = getEntityText("invoice_id") || "";
    const fechaRaw = getEntityText("invoice_date");
    const valorStr = getEntityText("total_amount").replace(/[^0-9.]/g, "") || "0";

    let fecha = new Date().toISOString().split("T")[0];
    if (fechaRaw) {
      const parsedDate = new Date(fechaRaw);
      if (!isNaN(parsedDate.getTime())) {
        fecha = parsedDate.toISOString().split("T")[0];
      }
    }

    const isHotel = proveedor.toUpperCase().includes("HOTEL") || proveedor.toUpperCase().includes("HOSPEDAJE");

    const doc: OcrDocument = {
      proveedor: proveedor.toUpperCase(),
      nit,
      tipoDoc: "FAC",
      serie,
      numero,
      fecha,
      placa: "",
      concepto: isHotel ? "HOSPEDAJE / ALOJAMIENTO" : "CONSUMO GENERAL",
      tipoGasto: isHotel ? "Hospedaje" : "Viáticos",
      valor: parseFloat(valorStr).toFixed(2),
      galones: "",
      tipoComb: "",
      inguat: "",
      pais: "GUATEMALA",
      sitio: "",
      confianza: "alta",
    };

    return NextResponse.json(doc);
  } catch (err) {
    console.error("Error en Google Document AI:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
