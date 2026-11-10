import { HospitalAdminEntry } from "@/features/admin/hospital-admin-entry";

export const dynamic = "force-dynamic";

export default async function HospitalAdminPage({ searchParams }: {
  searchParams: Promise<{ hospitalId?: string }>;
}) {
  const { hospitalId } = await searchParams;
  return <HospitalAdminEntry hospitalId={hospitalId} />;
}
