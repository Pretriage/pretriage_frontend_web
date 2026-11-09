import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffShell } from "@/components/staff-shell";
import { hoyIso } from "@/lib/argentina-date";
import { HospitalMetricsPanel } from "@/features/admin/hospital-metrics-panel";
import { getSession } from "@/lib/session";
import { getStaffContext, staffDisplayName } from "@/lib/staff-context";
import { hasMultipleHospitals } from "@/lib/workspace-routing";

export const dynamic = "force-dynamic";

type MetricsSearchParams = {
  hospitalId?: string | string[];
  desde?: string | string[];
  hasta?: string | string[];
};

/** Un parámetro repetido en la URL no debe romper la página: se usa el primero. */
function primerParametro(valor?: string | string[]) {
  return Array.isArray(valor) ? valor[0] ?? "" : valor ?? "";
}

export default async function HospitalMetricsPage({ searchParams }: { searchParams: Promise<MetricsSearchParams> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const context = await getStaffContext();
  if (!context) redirect("/");
  const userName = staffDisplayName(context, session.user, "Administrador");

  const hospitalIdParam = primerParametro(params.hospitalId).trim();
  const desde = primerParametro(params.desde);
  const hasta = primerParametro(params.hasta);
  const hospitalIdSolicitado = hospitalIdParam ? Number(hospitalIdParam) : null;
  const membership = Number.isSafeInteger(hospitalIdSolicitado)
    ? context.membresias.find((item) =>
      item.roles.includes("ADMIN_HOSPITAL") && item.hospitalId === hospitalIdSolicitado)
    : undefined;

  if (membership) {
    return (
      <HospitalMetricsPanel
        hospitalId={membership.hospitalId}
        hospitalName={membership.hospitalNombre}
        roles={membership.roles}
        canSwitchHospital={hasMultipleHospitals(context.membresias)}
        desde={desde}
        hasta={hasta}
        hoyInicial={hoyIso()}
        userName={userName}
      />
    );
  }

  // Con un hospitalId que no es el del admin conectado: sin métricas de otro hospital, redirect.
  if (hospitalIdSolicitado !== null) redirect("/");

  // Sin hospitalId: mensaje claro con el camino a Administración, sin redirect y sin llamadas.
  // Solo un admin hospitalario puede ver esta pantalla; cualquier otro rol vuelve al inicio.
  const ownHospital = context.membresias.find((item) => item.roles.includes("ADMIN_HOSPITAL"));
  if (!ownHospital) redirect("/");
  return (
    <StaffShell
      role="Administración"
      userName={userName}
      section="Personal"
      sectionNavigation={(
        <Link className="nav-item nav-subitem" href={`/admin/hospital?hospitalId=${ownHospital.hospitalId}`}>
          <span className="nav-dot" aria-hidden="true" />Administración
        </Link>
      )}
      hospitalId={ownHospital.hospitalId}
      hospitalName={ownHospital.hospitalNombre}
      roles={ownHospital.roles}
      canSwitchHospital={hasMultipleHospitals(context.membresias)}
    >
      <div className="page-stack admin-workspace">
        <header className="page-heading">
          <p className="eyebrow">Métricas del hospital</p>
          <h1>Falta elegir el hospital</h1>
        </header>
        <section className="panel metrics-empty">
          <strong>No indicaste el hospital de las métricas</strong>
          <p>
            Abrí Administración, elegí tu hospital y volvé a abrir Métricas desde el menú lateral.
          </p>
          <Link className="button button-secondary" href={`/admin/hospital?hospitalId=${ownHospital.hospitalId}`}>
            Ir a Administración
          </Link>
        </section>
      </div>
    </StaffShell>
  );
}
