import Link from "next/link";
import { BotonCierreSesion } from "@/components/boton-cierre-sesion";
import { Brand } from "@/components/brand";
import { GuardiaSesionProtegida } from "@/components/guardia-sesion-protegida";
import type { StaffMembership } from "@/lib/staff-context";
import { defaultHospitalRoute } from "@/lib/workspace-routing";

export function WorkspaceSelector({ memberships, accountLabel, platformAdmin }: {
  memberships: StaffMembership[];
  accountLabel: string;
  platformAdmin: boolean;
}) {
  const availableMemberships = memberships.filter(
    (membership) => membership.estado === "ACTIVA" && defaultHospitalRoute(membership),
  );

  return (
    <main className="public-shell workspace-shell">
      <GuardiaSesionProtegida />
      <section className="workspace-selector-card">
        <header className="workspace-header">
          <Brand size="large" />
          <div>
            <p className="eyebrow">Espacio de trabajo</p>
            <h1>{availableMemberships.length ? "Elegí un hospital" : "Sin acceso hospitalario"}</h1>
            <p className="muted">
              {!availableMemberships.length
                ? "Tu cuenta todavía no tiene una membresía activa."
                : "Tus módulos aparecerán automáticamente según los roles que tengas allí."}
            </p>
          </div>
        </header>

        <div className="workspace-options" aria-live="polite">
          {!availableMemberships.length ? (
            <div className="workspace-empty">
              <span aria-hidden="true">!</span>
              <h2>No tenés accesos activos</h2>
              <p>Un administrador del hospital debe asignarte un rol antes de que puedas ingresar.</p>
            </div>
          ) : (
            <div className="workspace-option-list">
              {platformAdmin ? (
                <Link className="workspace-choice" href="/admin/plataforma">
                  <span className="workspace-choice-icon workspace-role-icon" aria-hidden="true">P</span>
                  <span className="workspace-choice-copy">
                    <strong>Administración de plataforma</strong>
                    <small>Gestionar hospitales y sus primeros administradores.</small>
                  </span>
                  <span className="workspace-choice-arrow" aria-hidden="true">→</span>
                </Link>
              ) : null}
              {availableMemberships.map((membership) => {
                const route = defaultHospitalRoute(membership)!;
                const moduleCount = membership.roles.filter((role) =>
                  ["RECEPCIONISTA", "MEDICO", "ADMIN_HOSPITAL"].includes(role),
                ).length;
                return (
                  <Link
                    className="workspace-choice"
                    key={membership.id}
                    href={route}
                  >
                    <span className="workspace-choice-icon" aria-hidden="true">H</span>
                    <span className="workspace-choice-copy">
                      <strong>{membership.hospitalNombre}</strong>
                      <small>{moduleCount} {moduleCount === 1 ? "módulo disponible" : "módulos disponibles"}</small>
                    </span>
                    <span className="workspace-choice-arrow" aria-hidden="true">→</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <footer className="workspace-footer">
          <span>Sesión iniciada como <strong>{accountLabel}</strong></span>
          <div className="flex flex-wrap items-center gap-4">
            <Link className="workspace-logout" href="/cuenta/perfil">Perfil</Link>
            <BotonCierreSesion clase="workspace-logout" etiqueta="Cerrar sesión" etiquetaEnProceso="Cerrando…" />
          </div>
        </footer>
      </section>
    </main>
  );
}
