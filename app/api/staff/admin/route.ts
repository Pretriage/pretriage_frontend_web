import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/route";
import { backendRequest } from "@/lib/api/server";
import { z } from "zod";

type Body = Record<string, unknown> & { operation?: string; hospitalId?: number };
const noStore = { "Cache-Control": "private, no-store" };

function id(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} inválido.`);
  return value;
}

const namedSpecialtySchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  especialidadId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
const updateSectorSchema = namedSpecialtySchema.extend({ activa: z.boolean() });

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const hospitalId = id(body.hospitalId, "hospitalId");
    const base = `/api/admin/hospitales/${hospitalId}`;
    switch (body.operation) {
      case "bootstrap": {
        const [personal, invitaciones, configuracion] = await Promise.all([
          backendRequest(`${base}/personal`),
          backendRequest(`${base}/invitaciones`),
          backendRequest(`${base}/configuracion`),
        ]);
        return NextResponse.json({ personal, invitaciones, configuracion });
      }
      case "getConfiguration":
        return NextResponse.json(await backendRequest(`${base}/configuracion`), { headers: noStore });
      case "discrepancies":
        return NextResponse.json(
          await backendRequest(`${base}/discrepancias`),
          { headers: noStore },
        );
      case "annulDiscrepancy": {
        const discrepancyId = id(body.discrepancyId, "discrepancyId");
        await backendRequest(`${base}/discrepancias/${discrepancyId}/anular`, { method: "POST" });
        return new NextResponse(null, { status: 204, headers: noStore });
      }
      case "invite":
        return NextResponse.json(await backendRequest(`${base}/invitaciones`, {
          method: "POST", body: JSON.stringify(body.invitation),
        }));
      case "revokeInvitation": {
        const invitationId = id(body.invitationId, "invitationId");
        await backendRequest(`${base}/invitaciones/${invitationId}`, { method: "DELETE" });
        return new NextResponse(null, { status: 204 });
      }
      case "resendInvitation": {
        const invitationId = id(body.invitationId, "invitationId");
        return NextResponse.json(await backendRequest(`${base}/invitaciones/${invitationId}/reenviar`, {
          method: "POST",
        }));
      }
      case "setMembershipState": {
        const membershipId = id(body.membershipId, "membershipId");
        if (body.estado !== "ACTIVA" && body.estado !== "SUSPENDIDA") throw new TypeError("Estado de membresía inválido.");
        const estado = body.estado;
        return NextResponse.json(await backendRequest(`${base}/membresias/${membershipId}`, {
          method: "PATCH", body: JSON.stringify({ estado }),
        }));
      }
      case "setMembershipRoleState": {
        const membershipId = id(body.membershipId, "membershipId");
        if (body.role !== "ADMIN_HOSPITAL" && body.role !== "MEDICO" && body.role !== "RECEPCIONISTA") throw new TypeError("Rol inválido.");
        const role = body.role;
        if (body.estado !== "ACTIVA" && body.estado !== "SUSPENDIDA") throw new TypeError("Estado del rol inválido.");
        return NextResponse.json(await backendRequest(`${base}/membresias/${membershipId}/roles/${role}`, {
          method: "PATCH", body: JSON.stringify({ estado: body.estado }),
        }));
      }
      case "enableSpecialty": {
        const specialtyId = id(body.specialtyId, "specialtyId");
        return NextResponse.json(await backendRequest(`${base}/configuracion/especialidades/${specialtyId}`, {
          method: "POST",
        }));
      }
      case "disableSpecialty": {
        const specialtyId = id(body.specialtyId, "specialtyId");
        return NextResponse.json(await backendRequest(`${base}/configuracion/especialidades/${specialtyId}`, {
          method: "DELETE",
        }));
      }
      case "createSector":
        return NextResponse.json(await backendRequest(`${base}/configuracion/sectores`, {
          method: "POST", body: JSON.stringify(namedSpecialtySchema.parse(body.sector)),
        }));
      case "updateSector": {
        const sectorId = id(body.sectorId, "sectorId");
        return NextResponse.json(await backendRequest(`${base}/configuracion/sectores/${sectorId}`, {
          method: "PUT", body: JSON.stringify(updateSectorSchema.parse(body.sector)),
        }));
      }
      case "deleteSector": {
        const sectorId = id(body.sectorId, "sectorId");
        await backendRequest(`${base}/configuracion/sectores/${sectorId}`, { method: "DELETE" });
        return new NextResponse(null, { status: 204 });
      }
      case "sectorSessions": {
        const sectorId = id(body.sectorId, "sectorId");
        return NextResponse.json(await backendRequest(`${base}/configuracion/sectores/${sectorId}/sesiones`));
      }
      case "closeMedicalSession": {
        const sectorId = id(body.sectorId, "sectorId");
        const sessionId = id(body.sessionId, "sessionId");
        return NextResponse.json(await backendRequest(`${base}/configuracion/sectores/${sectorId}/sesiones/${sessionId}/cerrar`, {
          method: "POST",
        }));
      }
      case "createRoom": {
        const sectorId = id(body.sectorId, "sectorId");
        return NextResponse.json(await backendRequest(`${base}/configuracion/sectores/${sectorId}/salas`, {
          method: "POST", body: JSON.stringify(namedSpecialtySchema.parse(body.room)),
        }));
      }
      case "updateRoom": {
        const roomId = id(body.roomId, "roomId");
        const sectorId = id(body.sectorId, "sectorId");
        return NextResponse.json(await backendRequest(`${base}/configuracion/sectores/${sectorId}/salas/${roomId}`, {
          method: "PUT", body: JSON.stringify(namedSpecialtySchema.parse(body.room)),
        }));
      }
      case "setRoomActive": {
        const roomId = id(body.roomId, "roomId");
        const sectorId = id(body.sectorId, "sectorId");
        return NextResponse.json(await backendRequest(`${base}/configuracion/sectores/${sectorId}/salas/${roomId}/estado`, {
          method: "PATCH", body: JSON.stringify({ activa: z.boolean().parse(body.active) }),
        }));
      }
      default:
        return NextResponse.json({ message: "Operación inválida." }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Revisá el nombre, la especialidad y el estado ingresados." }, { status: 400 });
    if (error instanceof TypeError) return NextResponse.json({ message: error.message }, { status: 400 });
    return apiErrorResponse(error);
  }
}
