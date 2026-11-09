import { redirect } from "next/navigation";
import { ReceptionWorkspace } from "@/features/reception/reception-workspace";
import { getSession } from "@/lib/session";
import { getStaffContext, staffDisplayName } from "@/lib/staff-context";
import { hasMultipleHospitals } from "@/lib/workspace-routing";

export const dynamic = "force-dynamic";

export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ hospitalId?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const context = await getStaffContext();
  const rawHospitalId = (await searchParams).hospitalId;
  const hospitalId = Number(Array.isArray(rawHospitalId) ? rawHospitalId[0] : rawHospitalId);
  const membership = context?.membresias.find((item) =>
    item.estado === "ACTIVA" && item.roles.includes("RECEPCIONISTA") &&
    (!Number.isSafeInteger(hospitalId) || item.hospitalId === hospitalId));
  if (!membership) redirect("/");

  return (
    <ReceptionWorkspace
      userName={staffDisplayName(context, session.user, "Recepcionista")}
      hospitalId={membership.hospitalId}
      hospitalName={membership.hospitalNombre}
      roles={membership.roles}
      canSwitchHospital={hasMultipleHospitals(context?.membresias ?? [])}
    />
  );
}
