import { BotonCierreSesion } from "@/components/boton-cierre-sesion";
import { Brand } from "@/components/brand";
import { GuardiaSesionProtegida } from "@/components/guardia-sesion-protegida";
import Link from "next/link";
import type { HospitalRole } from "@/lib/staff-context";

type StaffShellProps = {
  role: "Recepción" | "Médico" | "Administración";
  userName: string;
  section: string;
  sessionLabel?: string;
  hospitalId: number;
  hospitalName: string;
  roles: HospitalRole[];
  canSwitchHospital: boolean;
  sectionNavigation?: React.ReactNode;
  profileActive?: boolean;
  children: React.ReactNode;
};

type StaffShellFrameProps = {
  userName: string;
  accountSubtitle: string;
  navigation: React.ReactNode;
  sectionLinks?: boolean;
  sessionLabel?: string;
  canSwitchHospital?: boolean;
  profileHref?: string;
  profileActive?: boolean;
  children: React.ReactNode;
};

const itemsByRole = {
  Recepción: [],
  Médico: ["Inicio", "Cola de pacientes", "Atenciones", "Pacientes"],
  Administración: [],
};

const modules: Array<{ role: HospitalRole; label: string; href: (hospitalId: number) => string }> = [
  { role: "RECEPCIONISTA", label: "Recepción", href: (id) => `/recepcion?hospitalId=${id}` },
  { role: "MEDICO", label: "Atención médica", href: (id) => `/medico?hospitalId=${id}` },
  { role: "ADMIN_HOSPITAL", label: "Administración", href: (id) => `/admin/hospital?hospitalId=${id}` },
];

export function StaffShellFrame({
  userName,
  accountSubtitle,
  navigation,
  sectionLinks,
  sessionLabel,
  canSwitchHospital,
  profileHref = "/cuenta/perfil",
  profileActive,
  children,
}: StaffShellFrameProps) {
  return (
    <div className="staff-app">
      <GuardiaSesionProtegida />
      <header className="topbar">
        <Brand />
        <div className="topbar-account">
          {sessionLabel ? <span className="session-pill">{sessionLabel}</span> : null}
          <div className="avatar" aria-hidden="true">{userName.charAt(0).toUpperCase()}</div>
          <div><strong>{userName}</strong><span>{accountSubtitle}</span></div>
          {canSwitchHospital ? <Link className="logout-link" href="/">Cambiar hospital</Link> : null}
          <Link className="logout-link" href={profileHref} aria-current={profileActive ? "page" : undefined}>Perfil</Link>
          <BotonCierreSesion clase="logout-link" etiqueta="Salir" />
        </div>
      </header>
      <aside className={sectionLinks ? "sidebar sidebar-section-links" : "sidebar"} aria-label="Navegación principal">
        <nav>{navigation}</nav>
      </aside>
      <main className="staff-content">{children}</main>
    </div>
  );
}

export function StaffShell({ role, userName, section, sessionLabel, hospitalId, hospitalName, roles, canSwitchHospital, sectionNavigation, profileActive, children }: StaffShellProps) {
  const availableModules = modules.filter((module) => roles.includes(module.role));
  const sections = profileActive ? [] : itemsByRole[role];
  const activeModuleRole: HospitalRole = role === "Recepción"
    ? "RECEPCIONISTA"
    : role === "Médico" ? "MEDICO" : "ADMIN_HOSPITAL";

  return (
    <StaffShellFrame
      userName={userName}
      accountSubtitle={`${hospitalName} · ${role}`}
      sessionLabel={sessionLabel}
      canSwitchHospital={canSwitchHospital}
      profileHref={`/cuenta/perfil?hospitalId=${hospitalId}&modulo=${activeModuleRole}`}
      profileActive={profileActive}
      sectionLinks={Boolean(sectionNavigation)}
      navigation={(
        <>
          {availableModules.map((module) => (
            <Link className={module.role === activeModuleRole ? "nav-item nav-item-active" : "nav-item"} href={module.href(hospitalId)} key={module.role}>
              <span className="nav-dot" aria-hidden="true" />{module.label}
            </Link>
          ))}
          {(sectionNavigation || sections.length > 0) && <span className="nav-divider" aria-hidden="true" />}
          {sectionNavigation ?? sections.map((item) => <span className={item === section ? "nav-item nav-item-active nav-subitem" : "nav-item nav-subitem"} key={item}><span className="nav-dot" aria-hidden="true" />{item}</span>)}
        </>
      )}
    >
      {children}
    </StaffShellFrame>
  );
}
