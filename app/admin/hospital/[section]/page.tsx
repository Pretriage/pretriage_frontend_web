import { notFound, redirect } from "next/navigation";
import { HospitalAdminEntry } from "@/features/admin/hospital-admin-entry";
import { isHospitalAdminSectionId } from "@/features/admin/hospital-admin-sections";

export const dynamic = "force-dynamic";

export default async function HospitalAdminSectionPage({ params, searchParams }: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ hospitalId?: string }>;
}) {
  const [{ section }, { hospitalId }] = await Promise.all([params, searchParams]);
  if (section === "invitaciones") {
    redirect(`/admin/hospital/invitar${hospitalId ? `?hospitalId=${encodeURIComponent(hospitalId)}` : ""}`);
  }
  if (section === "inicio" || section === "auditoria") {
    redirect(`/admin/hospital/configuracion${hospitalId ? `?hospitalId=${encodeURIComponent(hospitalId)}` : ""}`);
  }
  if (!isHospitalAdminSectionId(section)) notFound();
  return <HospitalAdminEntry hospitalId={hospitalId} section={section} />;
}
