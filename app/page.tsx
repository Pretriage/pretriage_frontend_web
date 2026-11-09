import { redirect } from "next/navigation";
import { WorkspaceSelector } from "@/features/workspaces/workspace-selector";
import { getSession } from "@/lib/session";
import { getStaffContext, staffDisplayName } from "@/lib/staff-context";
import { defaultHospitalRoute } from "@/lib/workspace-routing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  const context = await getStaffContext();
  const activeMemberships = context?.membresias.filter(
    (membership) => membership.estado === "ACTIVA" && defaultHospitalRoute(membership),
  ) ?? [];
  if (activeMemberships.length === 1) redirect(defaultHospitalRoute(activeMemberships[0])!);
  if (!activeMemberships.length && context?.administradorPlataforma) redirect("/admin/plataforma");

  return (
    <WorkspaceSelector
      memberships={context?.membresias ?? []}
      accountLabel={staffDisplayName(context, session.user, "usuario")}
      platformAdmin={context?.administradorPlataforma ?? false}
    />
  );
}
