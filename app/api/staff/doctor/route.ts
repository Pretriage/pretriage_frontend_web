import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/route";
import { BackendApiError, backendRequest, backendResponse } from "@/lib/api/server";
import type {
  CurrentMedicalState,
  ConsultationClinicalData,
  ConsultationPretriage,
  DoctorAssignment,
  DoctorBootstrap,
  MedicalAttention,
  MedicalRoom,
  MedicalSector,
  MedicalSession,
  QueueConsultation,
  PriorityReviewRequest,
  SymptomsDiscrepancy,
} from "@/lib/api/types";

type Body = Record<string, unknown> & { operation?: string };
const noStore = { "Cache-Control": "private, no-store" };

function consultationPath(body: Body) {
  const sessionId = numberValue(body.sessionId, "sessionId");
  const consultationId = numberValue(body.consultationId, "consultationId");
  return `/api/medico/sesiones/${sessionId}/consultas/${consultationId}`;
}

async function optionalConsultationData<T>(path: string): Promise<T | null> {
  try {
    return await backendRequest<T>(path);
  } catch (error) {
    // Older backends answer with Spring's missing-route response for optional reads.
    if (error instanceof BackendApiError && error.status === 404 && error.message === "Recurso no encontrado.") {
      return null;
    }
    throw error;
  }
}

function previewContentType(value: string | null) {
  const type = value?.split(";")[0]?.trim().toLowerCase() ?? "";
  return ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"].includes(type)
    ? type
    : null;
}

function numberValue(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`${field} inválido.`);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    switch (body.operation) {
      case "bootstrap": {
        const [assignments, history, current] = await Promise.all([
          backendRequest<DoctorAssignment[]>("/api/medico/asignaciones"),
          backendRequest<MedicalAttention[]>("/api/medico/atenciones"),
          backendRequest<CurrentMedicalState>("/api/medico/sesiones/actual"),
        ]);
        return NextResponse.json({
          assignments,
          history,
          session: current.sesion ?? null,
          currentConsultation: current.consultaActual ?? null,
        } satisfies DoctorBootstrap);
      }
      case "sectors": {
        const hospitalId = numberValue(body.hospitalId, "hospitalId");
        const specialty =
          typeof body.specialty === "string" ? body.specialty : "";
        return NextResponse.json(
          await backendRequest<MedicalSector[]>(
            `/api/hospitales/${hospitalId}/sectores?codigoEspecialidad=${encodeURIComponent(specialty)}`,
          ),
        );
      }
      case "rooms": {
        const hospitalId = numberValue(body.hospitalId, "hospitalId");
        const sectorId = numberValue(body.sectorId, "sectorId");
        const specialty =
          typeof body.specialty === "string" ? body.specialty : "";
        return NextResponse.json(
          await backendRequest<MedicalRoom[]>(
            `/api/hospitales/${hospitalId}/sectores/${sectorId}/salas?codigoEspecialidad=${encodeURIComponent(specialty)}`,
          ),
        );
      }
      case "startSession":
        return NextResponse.json(
          await backendRequest<MedicalSession>("/api/medico/sesiones", {
            method: "POST",
            body: JSON.stringify({
              hospitalId: numberValue(body.hospitalId, "hospitalId"),
              codigoEspecialidad:
                typeof body.specialty === "string" ? body.specialty : "",
              sectorId: numberValue(body.sectorId, "sectorId"),
              salaId: numberValue(body.roomId, "roomId"),
            }),
          }),
        );
      case "sessionAction": {
        const sessionId = numberValue(body.sessionId, "sessionId");
        const action = body.action;
        if (!["pausar", "reanudar", "cerrar"].includes(String(action))) {
          throw new TypeError("Acción de sesión inválida.");
        }
        return NextResponse.json(
          await backendRequest<MedicalSession>(
            `/api/medico/sesiones/${sessionId}/${action}`,
            { method: "POST" },
          ),
        );
      }
      case "queue": {
        const sessionId = numberValue(body.sessionId, "sessionId");
        return NextResponse.json(
          await backendRequest<QueueConsultation[]>(
            `/api/medico/sesiones/${sessionId}/pacientes-disponibles`,
          ),
        );
      }
      case "selectNext": {
        const sessionId = numberValue(body.sessionId, "sessionId");
        return NextResponse.json(
          await backendRequest<QueueConsultation>(
            `/api/medico/sesiones/${sessionId}/seleccionar-proximo`,
            { method: "POST" },
          ),
        );
      }
      case "consultationAction": {
        const action = body.action;
        if (!["llamar", "devolver-a-cola", "presente", "ausente", "finalizar"].includes(String(action))) {
          throw new TypeError("Acción de consulta inválida.");
        }
        return NextResponse.json(
          await backendRequest<QueueConsultation>(
            `${consultationPath(body)}/${action}`,
            { method: "POST" },
          ),
        );
      }
      case "pretriage": {
        return NextResponse.json(
          await backendRequest<ConsultationPretriage>(
            `${consultationPath(body)}/pretriaje`,
          ),
          { headers: noStore },
        );
      }
      case "clinicalData":
        return NextResponse.json(
          await optionalConsultationData<ConsultationClinicalData>(`${consultationPath(body)}/datos-clinicos`),
          { headers: noStore },
        );
      case "clinicalFile":
      case "downloadClinicalFile": {
        const studyId = numberValue(body.studyId, "studyId");
        const file = await backendResponse(
          `${consultationPath(body)}/datos-clinicos/estudios/${studyId}/archivo`,
          {
            headers: { Accept: "*/*" },
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]),
          },
        );
        const type = body.operation === "downloadClinicalFile"
          ? "application/octet-stream"
          : previewContentType(file.headers.get("content-type"));
        if (!type || !file.body) {
          await file.body?.cancel();
          return NextResponse.json(
            { message: "Este formato de archivo no admite vista previa." },
            { status: 415, headers: noStore },
          );
        }
        return new Response(file.body, {
          headers: {
            ...noStore,
            "Content-Type": type,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      case "symptomsDiscrepancy":
        return NextResponse.json(
          await optionalConsultationData<SymptomsDiscrepancy>(`${consultationPath(body)}/discrepancia-sintomas`),
          { headers: noStore },
        );
      case "reportSymptomsDiscrepancy":
        return NextResponse.json(
          await backendRequest<SymptomsDiscrepancy>(
            `${consultationPath(body)}/discrepancia-sintomas`,
            { method: "PUT" },
          ),
          { headers: noStore },
        );
      case "reviewPriority": {
        const decision = body.decision;
        if (!['CONFIRMAR', 'CORREGIR'].includes(String(decision))) {
          throw new TypeError("Decisión de prioridad inválida.");
        }
        const review: PriorityReviewRequest = {
          decision: decision as PriorityReviewRequest["decision"],
          prioridad:
            typeof body.priority === "string"
              ? (body.priority as PriorityReviewRequest["prioridad"])
              : undefined,
          motivo: typeof body.reason === "string" ? body.reason : undefined,
        };
        return NextResponse.json(
          await backendRequest<ConsultationPretriage>(
            `${consultationPath(body)}/revision-prioridad`,
            { method: "PUT", body: JSON.stringify(review) },
          ),
          { headers: noStore },
        );
      }
      default:
        return NextResponse.json({ message: "Operación inválida." }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof TypeError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return apiErrorResponse(error);
  }
}
