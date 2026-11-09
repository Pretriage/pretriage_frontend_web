"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffShell } from "@/components/staff-shell";
import { formatoFechaHoraArgentina } from "@/lib/argentina-date";
import type { HospitalRole } from "@/lib/staff-context";
import { HospitalConfigurationPanel } from "./hospital-configuration-panel";
import type { ConfigurationOperation, HospitalConfiguration, MedicalSession } from "./hospital-configuration";
import { StaffInvitationForm, type StaffInvitationDto } from "./staff-invitation-form";
import { HospitalAdminNavigation } from "./hospital-admin-navigation";

type Role = "ADMIN_HOSPITAL" | "MEDICO" | "RECEPCIONISTA";
type Person = { membresiaId: number; nombre: string; apellido: string; email: string; estado: string; roles: Role[] };
type Invitation = { id: number; email: string; estado: string; roles: Role[]; venceEn: string; matricula?: string | null; tipoMatricula?: string | null; jurisdiccionMatricula?: string | null; emailEnviado?: boolean; ultimoIntentoEnvio?: string | null; cantidadIntentosEnvio?: number; tokenEntregaUnica?: string | null };
type Audit = { id: number; fecha: string; actor: string; accion: string; resultado: string };
type Bootstrap = { personal: Person[]; invitaciones: Invitation[]; auditoria: Audit[]; configuracion: HospitalConfiguration };
const roleLabel: Record<Role, string> = { RECEPCIONISTA: "Recepción", MEDICO: "Medicina", ADMIN_HOSPITAL: "Administración hospitalaria" };
async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/staff/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message ?? "No pudimos completar la operación.") as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export function HospitalAdminWorkspace({ hospitalId, hospitalName, userName, roles, canSwitchHospital }: { hospitalId: number; hospitalName: string; userName: string; roles: HospitalRole[]; canSwitchHospital: boolean }) {
  const queryClient = useQueryClient();
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const queryKey = ["hospital-admin", hospitalId];
  const query = useQuery({ queryKey, queryFn: () => adminCall<Bootstrap>({ operation: "bootstrap", hospitalId }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const invite = useMutation({
    mutationFn: (invitation: StaffInvitationDto) => adminCall<Invitation>({ operation: "invite", hospitalId, invitation }),
    onSuccess: async (result) => {
      setCreatedToken(result.tokenEntregaUnica ?? null);
      setDeliveryMessage(result.emailEnviado ? "Invitación enviada por correo." : result.tokenEntregaUnica ? "Invitación creada para entrega local." : "Invitación creada; el envío está pendiente. Podés reintentar desde la lista.");
      await refresh();
    },
  });
  const revoke = useMutation({ mutationFn: (invitationId: number) => adminCall({ operation: "revokeInvitation", hospitalId, invitationId }), onSuccess: refresh });
  const resend = useMutation({
    mutationFn: (invitationId: number) => adminCall<Invitation>({ operation: "resendInvitation", hospitalId, invitationId }),
    onSuccess: async (result) => {
      setCreatedToken(result.tokenEntregaUnica ?? null);
      setDeliveryMessage(result.emailEnviado ? "Invitación reenviada por correo." : result.tokenEntregaUnica ? "Se generó un enlace local nuevo; el anterior dejó de funcionar." : "El reenvío quedó pendiente; podés volver a intentarlo desde la lista.");
      await refresh();
    },
  });
  const configure = useMutation({ mutationFn: (payload: ConfigurationOperation) => adminCall({ hospitalId, ...payload }), onSettled: refresh });
  const refreshAfterSessionClose = async () => {
    await Promise.all([
      refresh(),
      queryClient.invalidateQueries({ queryKey: ["doctor"] }),
    ]);
  };
  const loadSectorSessions = (sectorId: number) => adminCall<MedicalSession[]>({ operation: "sectorSessions", hospitalId, sectorId });
  const closeMedicalSession = (sectorId: number, sessionId: number) => adminCall<MedicalSession>({ operation: "closeMedicalSession", hospitalId, sectorId, sessionId });
  return <StaffShell role="Administración" userName={userName} section="Personal" sectionNavigation={<HospitalAdminNavigation hospitalId={hospitalId} />} hospitalId={hospitalId} hospitalName={hospitalName} roles={roles} canSwitchHospital={canSwitchHospital}><div className="page-stack admin-workspace">
    <header className="page-heading"><p className="eyebrow">Administración hospitalaria</p><h1>{hospitalName}</h1><p>Gestioná el personal, los sectores y las salas de este hospital.</p></header>
    {query.isLoading ? <div className="loading-card">Cargando administración…</div> : null}{query.error ? <div className="notice notice-error" role="alert">{query.error.message}</div> : null}
    <section className="panel"><div className="panel-heading"><div><h2 id="admin-invite" tabIndex={-1}>Invitar personal</h2><p>El acceso solo se activa cuando la persona acepta.</p></div></div><StaffInvitationForm configuration={query.data?.configuracion} disabled={invite.isPending} error={invite.error} deliveryMessage={deliveryMessage} createdToken={createdToken} onSubmit={async (invitation) => { setCreatedToken(null); setDeliveryMessage(null); await invite.mutateAsync(invitation); }} /></section>
    <HospitalConfigurationPanel hospitalId={hospitalId} configuration={query.data?.configuracion} pending={configure.isPending || query.isFetching} error={configure.error} configure={(operation, onSuccess, onError) => configure.mutate(operation, { onSuccess, onError })} loadSectorSessions={loadSectorSessions} closeMedicalSession={closeMedicalSession} refreshAfterSessionClose={refreshAfterSessionClose} />
    <section className="panel"><div className="panel-heading"><div><h2 id="admin-personnel" tabIndex={-1}>Personal</h2><p>Membresías y roles vigentes.</p></div></div><div className="record-list">{query.data?.personal.map((person) => <div className="record-row" key={person.membresiaId}><div><strong>{person.nombre} {person.apellido}</strong><span>{person.email} · {person.roles.map((role) => roleLabel[role]).join(", ")} · {person.estado}</span></div></div>)}</div></section>
    <section className="panel"><div className="panel-heading"><div><h2 id="admin-invitations" tabIndex={-1}>Invitaciones</h2><p>Pendientes, aceptadas, vencidas y revocadas.</p></div></div><div className="record-list">{query.data?.invitaciones.map((item) => <div className="record-row" key={item.id}><div><strong>{item.email}</strong><span>{item.roles.map((role) => roleLabel[role]).join(", ")} · {item.estado}{item.emailEnviado ? " · correo enviado" : " · entrega pendiente"}{item.matricula ? ` · Matrícula ${item.tipoMatricula?.toLocaleLowerCase("es")} ${item.matricula} (${item.jurisdiccionMatricula})` : ""}</span></div>{item.estado === "PENDIENTE" || item.estado === "EXPIRADA" ? <div className="record-actions"><button className="button button-secondary" disabled={resend.isPending || revoke.isPending} onClick={() => resend.mutate(item.id)}>Reenviar</button>{item.estado === "PENDIENTE" ? <button className="button button-danger-ghost" disabled={revoke.isPending || resend.isPending} onClick={() => revoke.mutate(item.id)}>Revocar</button> : null}</div> : null}</div>)}</div></section>
    <section className="panel"><div className="panel-heading"><div><h2 id="admin-audit" tabIndex={-1}>Actividad reciente</h2><p>Cambios privilegiados auditados.</p></div></div><div className="record-list">{query.data?.auditoria.map((item) => <div className="record-row" key={item.id}><div><strong>{item.accion}</strong><span>{item.actor} · {formatoFechaHoraArgentina(item.fecha)}</span></div><span>{item.resultado}</span></div>)}</div></section>
  </div></StaffShell>;
}
