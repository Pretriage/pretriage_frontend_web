import { redirect } from "next/navigation";
import { PlatformAdminWorkspace } from "@/features/admin/platform-admin-workspace";
import { getSession } from "@/lib/session";
import { getStaffContext, staffDisplayName } from "@/lib/staff-context";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const context = await getStaffContext();
  if (!context?.administradorPlataforma) redirect("/");
  return <PlatformAdminWorkspace userName={staffDisplayName(context, session.user, "Administrador")} />;
}
