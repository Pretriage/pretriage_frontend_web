import "server-only";
import { backendRequest } from "@/lib/api/server";
import type { StaffSession } from "@/lib/session";

export type HospitalRole =
  | "ADMIN_HOSPITAL"
  | "MEDICO"
  | "RECEPCIONISTA";

export type StaffMembership = {
  id: number;
  hospitalId: number;
  hospitalNombre: string;
  estado: "ACTIVA" | "SUSPENDIDA" | "REVOCADA" | "INVITADA";
  roles: HospitalRole[];
};

export type StaffContext = {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  administradorPlataforma: boolean;
  membresias: StaffMembership[];
};

export async function getStaffContext() {
  try {
    return await backendRequest<StaffContext>("/api/staff/me");
  } catch {
    return null;
  }
}

export function staffDisplayName(
  context: StaffContext | null,
  user: StaffSession["user"],
  fallback: string,
) {
  const fullName = `${context?.nombre ?? ""} ${context?.apellido ?? ""}`.trim();
  return fullName || user.name || user.email || fallback;
}

export function hasRole(context: StaffContext | null, role: HospitalRole) {
  return context?.membresias.some((membership) => membership.roles.includes(role)) ?? false;
}
