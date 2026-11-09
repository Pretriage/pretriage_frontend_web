import { redirect } from "next/navigation";
import { HospitalAdminWorkspace } from "@/features/admin/hospital-admin-workspace";
import { getSession } from "@/lib/session";
import { getStaffContext, staffDisplayName } from "@/lib/staff-context";
import { hasMultipleHospitals } from "@/lib/workspace-routing";

export const dynamic = "force-dynamic";

export default async function HospitalAdminPage({ searchParams }: { searchParams: Promise<{ hospitalId?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const context = await getStaffContext();
  const selectedHospitalId = Number((await searchParams).hospitalId);
  const membership = context?.membresias.find((item) =>
    item.roles.includes("ADMIN_HOSPITAL") &&
    (!Number.isSafeInteger(selectedHospitalId) || item.hospitalId === selectedHospitalId));
  if (!membership) redirect("/");
  return <HospitalAdminWorkspace hospitalId={membership.hospitalId} hospitalName={membership.hospitalNombre} roles={membership.roles} canSwitchHospital={hasMultipleHospitals(context?.membresias ?? [])} userName={staffDisplayName(context, session.user, "Administrador")} />;
}
