import { redirect } from "next/navigation";
import { HospitalAdminWorkspace } from "@/features/admin/hospital-admin-workspace";
import { getSession } from "@/lib/session";
import { getStaffContext, staffDisplayName } from "@/lib/staff-context";
import { hasMultipleHospitals } from "@/lib/workspace-routing";
import type { HospitalAdminSectionId } from "./hospital-admin-sections";

export async function HospitalAdminEntry({ hospitalId: requestedHospitalId, section = "configuracion" }: {
  hospitalId?: string | string[];
  section?: HospitalAdminSectionId;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const context = await getStaffContext();
  const hospitalIdParameter = Array.isArray(requestedHospitalId) ? requestedHospitalId[0] : requestedHospitalId;
  let selectedHospitalId: number | undefined;
  if (hospitalIdParameter !== undefined) {
    const parsedHospitalId = Number(hospitalIdParameter.trim());
    if (!Number.isSafeInteger(parsedHospitalId) || parsedHospitalId <= 0) redirect("/");
    selectedHospitalId = parsedHospitalId;
  }
  const membership = context?.membresias.find((item) =>
    item.estado === "ACTIVA" &&
    item.roles.includes("ADMIN_HOSPITAL") &&
    (selectedHospitalId === undefined || item.hospitalId === selectedHospitalId));
  if (!membership) redirect("/");
  return <HospitalAdminWorkspace
    hospitalId={membership.hospitalId}
    hospitalName={membership.hospitalNombre}
    roles={membership.roles}
    canSwitchHospital={hasMultipleHospitals(context?.membresias ?? [])}
    userName={staffDisplayName(context, session.user, "Administrador")}
    activeSection={section}
  />;
}
