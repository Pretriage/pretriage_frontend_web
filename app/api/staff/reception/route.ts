import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/route";
import { backendRequest } from "@/lib/api/server";
import type {
  CreatePatientCredential,
  PatientCredential,
  CreateReceptionAdmission,
  ReceptionAdmission,
  ReceptionAdmissionDetail,
  ReceptionBootstrap,
  ReceptionHospital,
  ReceptionPatient,
  ReceptionSession,
  ReceptionTriageForm,
} from "@/lib/api/types";

type Body = Record<string, unknown> & { operation?: string };

function numberValue(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`${field} inválido.`);
  }
  return value;
}

function credentialValue(value: unknown): CreatePatientCredential {
  if (!value || typeof value !== "object") {
    throw new TypeError("Credencial inválida.");
  }
  const credential = value as Record<string, unknown>;
  const nombreObraSocial = credential.nombreObraSocial;
  const numeroAfiliado = credential.numeroAfiliado;
  const plan = credential.plan;
  const fechaVencimiento = credential.fechaVencimiento;
  if (
    typeof nombreObraSocial !== "string" ||
    typeof numeroAfiliado !== "string" ||
    typeof plan !== "string" ||
    typeof fechaVencimiento !== "string"
  ) {
    throw new TypeError("Credencial inválida.");
  }
  return { nombreObraSocial, numeroAfiliado, plan, fechaVencimiento };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    switch (body.operation) {
      case "bootstrap": {
        const hospitals =
          await backendRequest<ReceptionHospital[]>("/api/recepcion/hospitales");
        const session =
          await backendRequest<ReceptionSession | null>(
            "/api/recepcion/sesiones/activa",
          );
        const openAdmissions = session?.id
          ? await backendRequest<ReceptionAdmissionDetail[]>(
              `/api/recepcion/admisiones?sesionId=${session.id}`,
            )
          : [];
        return NextResponse.json({
          hospitals,
          session,
          openAdmissions,
        } satisfies ReceptionBootstrap);
      }
      case "startSession":
        return NextResponse.json(
          await backendRequest<ReceptionSession>("/api/recepcion/sesiones", {
            method: "POST",
            body: JSON.stringify({
              hospitalId: numberValue(body.hospitalId, "hospitalId"),
            }),
          }),
        );
      case "closeSession": {
        const sessionId = numberValue(body.sessionId, "sessionId");
        return NextResponse.json(
          await backendRequest<ReceptionSession>(
            `/api/recepcion/sesiones/${sessionId}/cerrar`,
            { method: "POST" },
          ),
        );
      }
      case "searchPatient": {
        const sessionId = numberValue(body.sessionId, "sessionId");
        const dni = typeof body.dni === "string" ? body.dni.replace(/\D/g, "") : "";
        if (!/^\d{7,8}$/.test(dni)) throw new TypeError("DNI inválido.");
        return NextResponse.json(
          await backendRequest<ReceptionPatient>(
            `/api/recepcion/pacientes/${dni}?sesionId=${sessionId}`,
          ),
        );
      }
      case "createAdmission":
        return NextResponse.json(
          await backendRequest<ReceptionAdmission>("/api/recepcion/admisiones", {
            method: "POST",
            body: JSON.stringify(body.admission as CreateReceptionAdmission),
          }),
        );
      case "patientCredentials": {
        const patientId = numberValue(body.patientId, "patientId");
        return NextResponse.json(
          await backendRequest<PatientCredential[]>(
            `/api/pacientes/${patientId}/obrasocial/credenciales`,
          ),
        );
      }
      case "createPatientCredential": {
        const patientId = numberValue(body.patientId, "patientId");
        return NextResponse.json(
          await backendRequest<{ mensaje?: string }>(
            `/api/pacientes/${patientId}/obrasocial/credencial`,
            {
              method: "POST",
              body: JSON.stringify(credentialValue(body.credential)),
            },
          ),
        );
      }
      case "getAdmission": {
        const admissionId = numberValue(body.admissionId, "admissionId");
        return NextResponse.json(
          await backendRequest<ReceptionAdmissionDetail>(
            `/api/recepcion/admisiones/${admissionId}`,
          ),
        );
      }
      case "finalizeAdmission": {
        const admissionId = numberValue(body.admissionId, "admissionId");
        return NextResponse.json(
          await backendRequest<ReceptionAdmission>(
            `/api/recepcion/admisiones/${admissionId}/finalizar`,
            {
              method: "POST",
              body: JSON.stringify(body.form as ReceptionTriageForm),
            },
          ),
        );
      }
      case "cancelAdmission": {
        const admissionId = numberValue(body.admissionId, "admissionId");
        return NextResponse.json(
          await backendRequest<ReceptionAdmissionDetail>(
            `/api/recepcion/admisiones/${admissionId}/cancelar`,
            { method: "POST" },
          ),
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
