"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { apiClient } from "@/lib/api/client";

type Role = "ADMIN_HOSPITAL" | "MEDICO" | "RECEPCIONISTA";
type Person = {
  membresiaId: number;
  nombre: string;
  apellido: string;
  email: string;
  estado: "INVITADA" | "ACTIVA" | "SUSPENDIDA" | "REVOCADA";
  roles: Role[];
  rolesSuspendidos?: Role[];
};
const roles: Role[] = ["ADMIN_HOSPITAL", "MEDICO", "RECEPCIONISTA"];
const roleLabel: Record<Role, string> = {
  RECEPCIONISTA: "Recepción",
  MEDICO: "Medicina",
  ADMIN_HOSPITAL: "Administración hospitalaria",
};
const stateLabel: Record<Person["estado"], string> = {
  INVITADA: "Invitada",
  ACTIVA: "Membresía activa",
  SUSPENDIDA: "Membresía suspendida",
  REVOCADA: "Membresía revocada",
};
const headingId = "hospital-personnel-heading";

export function HospitalPersonnelPanel({
  hospitalId,
  personnel,
  pending,
  refresh,
}: {
  hospitalId: number;
  personnel: Person[];
  pending: boolean;
  refresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<{ person: Person; role: Role | null; estado: "ACTIVA" | "SUSPENDIDA" } | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const updateRole = useMutation({
    mutationFn: ({ membershipId, role, estado }: { membershipId: number; role: Role | null; estado: "ACTIVA" | "SUSPENDIDA" }) =>
      role
        ? apiClient("/api/staff/admin", "setMembershipRoleState", { hospitalId, membershipId, role, estado })
        : apiClient("/api/staff/admin", "setMembershipState", { hospitalId, membershipId, estado: "ACTIVA" }),
    onSuccess: async () => {
      await refresh();
      setUpdated(selected?.role
        ? `Se actualizó el rol de ${personName} · ${roleLabel[selected.role]}.`
        : `Se reactivó la membresía de ${personName}.`);
      setSelected(null);
    },
  });

  const isSuspending = selected?.estado === "SUSPENDIDA";
  const personName = selected ? `${selected.person.nombre} ${selected.person.apellido}` : "";
  const selectedRoleName = selected?.role ? roleLabel[selected.role] : null;

  function confirmChange(person: Person, role: Role | null, estado: "ACTIVA" | "SUSPENDIDA") {
    updateRole.reset();
    setUpdated(null);
    setSelected({ person, role, estado });
  }

  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="panel-heading">
        <div>
          <h2 id={headingId} tabIndex={-1}>Roles del personal</h2>
          <p>Suspendé o reactivá cada rol de manera independiente. La membresía y la cuenta personal se conservan.</p>
        </div>
      </div>
      {updated ? <p className="notice notice-success" role="status">{updated}</p> : null}
      {!pending && personnel.length === 0 ? <p className="notice notice-info">Todavía no hay personal con membresía en este hospital.</p> : null}
      <ul className="record-list personnel-list">
        {personnel.map((person) => (
          <li className="record-row personnel-row" key={person.membresiaId}>
            <div className="personnel-identity">
              <strong>{person.nombre} {person.apellido}</strong>
              <span>{person.email} · {stateLabel[person.estado]}</span>
            </div>
            <ul className="personnel-roles" aria-label={`Roles de ${person.nombre} ${person.apellido}`}>
              {roles.filter((role) => person.roles.includes(role)).map((role) => {
                const suspended = person.rolesSuspendidos?.includes(role) ?? false;
                const canManage = person.estado === "ACTIVA";
                return (
                  <li className="personnel-role" key={role}>
                    <span><strong>{roleLabel[role]}</strong><span className={suspended ? "personnel-role-state is-suspended" : "personnel-role-state"}>{suspended ? "Suspendido" : canManage ? "Activo" : "Sin acceso"}</span></span>
                    {canManage ? <button
                      className={`button ${suspended ? "button-secondary" : "button-danger-ghost"}`}
                      type="button"
                      disabled={pending || updateRole.isPending}
                      aria-label={`${suspended ? "Reactivar" : "Suspender"} rol ${roleLabel[role]} de ${person.nombre} ${person.apellido}`}
                      onClick={() => confirmChange(person, role, suspended ? "ACTIVA" : "SUSPENDIDA")}
                    >
                      {suspended ? "Reactivar rol" : "Suspender rol"}
                    </button> : null}
                  </li>
                );
              })}
            </ul>
            {person.estado === "SUSPENDIDA" ? <button
              className="button button-secondary"
              type="button"
              disabled={pending || updateRole.isPending}
              onClick={() => confirmChange(person, null, "ACTIVA")}
            >Reactivar membresía</button> : null}
          </li>
        ))}
      </ul>
      <ConfirmationDialog
        open={selected !== null}
        title={selectedRoleName ? (isSuspending ? "Suspender rol" : "Reactivar rol") : "Reactivar membresía"}
        description={selectedRoleName
          ? `¿${isSuspending ? "Suspender" : "Reactivar"} el rol ${selectedRoleName} de ${personName} en este hospital?`
          : `¿Reactivar la membresía de ${personName}? Recuperará los roles que figuran habilitados.`}
        confirmLabel={selectedRoleName ? (isSuspending ? "Sí, suspender rol" : "Sí, reactivar rol") : "Sí, reactivar membresía"}
        confirmTone={isSuspending ? "danger" : "primary"}
        pendingLabel="Actualizando el acceso…"
        pending={updateRole.isPending}
        error={updateRole.error}
        focusFallbackId={headingId}
        onConfirm={() => {
          if (!updateRole.isPending && selected) {
            updateRole.mutate({ membershipId: selected.person.membresiaId, role: selected.role, estado: selected.estado });
          }
        }}
        onCancel={() => {
          setSelected(null);
          updateRole.reset();
        }}
      />
    </section>
  );
}
