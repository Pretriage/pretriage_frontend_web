import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffShell, StaffShellFrame } from "@/components/staff-shell";
import { PasswordChangeForm } from "@/features/auth/password-change-form";
import { StaffProfileForm } from "@/features/auth/staff-profile-form";
import { getSession } from "@/lib/session";
import { getStaffContext, staffDisplayName } from "@/lib/staff-context";
import { hasMultipleHospitals, hospitalRoute } from "@/lib/workspace-routing";

export const dynamic = "force-dynamic";

const roleNames = {
  RECEPCIONISTA: "Recepción",
  MEDICO: "Médico",
  ADMIN_HOSPITAL: "Administración",
} as const;

type ProfileSearchParams = { hospitalId?: string | string[]; modulo?: string | string[] };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<ProfileSearchParams> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { hospitalId, modulo } = await searchParams;
  const profile = await getStaffContext();
  const userName = staffDisplayName(profile, session.user, "Personal hospitalario");
  const memberships = profile?.membresias ?? [];
  const membership = memberships.find((item) =>
    item.estado === "ACTIVA" && String(item.hospitalId) === hospitalId);
  const role = membership?.roles.find((item) => item === modulo);
  const fromPlatform = modulo === "plataforma" && profile?.administradorPlataforma;
  const returnHref = membership && role
    ? hospitalRoute(role, membership.hospitalId) ?? "/"
    : fromPlatform ? "/admin/plataforma" : "/";

  const content = (
    <div className="page-stack narrow-stack">
      <header className="page-heading heading-row">
        <div>
          <p className="eyebrow">Tu cuenta</p>
          <h1>Mi perfil</h1>
        </div>
        <Link className="button button-secondary" href={returnHref}>Volver</Link>
      </header>
      <section aria-labelledby="profile-data" className="panel">
        <div className="panel-heading"><h2 id="profile-data">Datos personales</h2></div>
        {profile ? (
          <StaffProfileForm nombre={profile.nombre ?? ""} apellido={profile.apellido ?? ""} email={profile.email ?? ""} />
        ) : (
          <p className="notice notice-error" role="alert">
            No pudimos cargar tus datos. Recargá la página para reintentar.
          </p>
        )}
      </section>
      <section aria-labelledby="contrasena" className="panel">
        <div className="panel-heading">
          <div>
            <h2 className="scroll-mt-24" id="contrasena" tabIndex={-1}>Cambiar contraseña</h2>
            <p>Confirmá tu contraseña actual y elegí una nueva.</p>
          </div>
        </div>
        <PasswordChangeForm />
      </section>
    </div>
  );

  if (membership && role) {
    return (
      <StaffShell
        role={roleNames[role]}
        userName={userName}
        section="Perfil"
        hospitalId={membership.hospitalId}
        hospitalName={membership.hospitalNombre}
        roles={membership.roles}
        canSwitchHospital={hasMultipleHospitals(memberships)}
        profileActive
      >
        {content}
      </StaffShell>
    );
  }

  return (
    <StaffShellFrame
      userName={userName}
      accountSubtitle={fromPlatform ? "Administración de plataforma" : "Tu cuenta"}
      profileHref={fromPlatform ? "/cuenta/perfil?modulo=plataforma" : undefined}
      profileActive
      navigation={(
        <Link className="nav-item" href={returnHref}>
          <span className="nav-dot" aria-hidden="true" />
          {fromPlatform ? "Administración de plataforma" : "Hospitales y módulos"}
        </Link>
      )}
    >
      {content}
    </StaffShellFrame>
  );
}
