"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffShell } from "@/components/staff-shell";
import type { HospitalRole } from "@/lib/staff-context";
import { HospitalConfigurationPanel } from "./hospital-configuration-panel";
import { HospitalDiscrepanciesPanel } from "./hospital-discrepancies-panel";
import { HospitalPersonnelPanel } from "./hospital-personnel-panel";
import type { ConfigurationOperation, HospitalConfiguration, MedicalSession } from "./hospital-configuration";
import { StaffInvitationForm, type StaffInvitationDto } from "./staff-invitation-form";
import { HospitalAdminNavigation } from "./hospital-admin-navigation";
import { hospitalAdminSections, type HospitalAdminSectionId } from "./hospital-admin-sections";
import styles from "./hospital-admin-workspace.module.css";

type Role = "ADMIN_HOSPITAL" | "MEDICO" | "RECEPCIONISTA";
type Person = { membresiaId: number; nombre: string; apellido: string; email: string; estado: "INVITADA" | "ACTIVA" | "SUSPENDIDA" | "REVOCADA"; roles: Role[]; rolesSuspendidos?: Role[] };
type Invitation = { id: number; email: string; estado: string; roles: Role[]; venceEn: string; matricula?: string | null; tipoMatricula?: string | null; jurisdiccionMatricula?: string | null; emailEnviado?: boolean; ultimoIntentoEnvio?: string | null; cantidadIntentosEnvio?: number; tokenEntregaUnica?: string | null };
type Bootstrap = { personal: Person[]; invitaciones: Invitation[]; configuracion?: HospitalConfiguration };
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

export function HospitalAdminWorkspace({ hospitalId, hospitalName, userName, roles, canSwitchHospital, activeSection = "configuracion" }: { hospitalId: number; hospitalName: string; userName: string; roles: HospitalRole[]; canSwitchHospital: boolean; activeSection?: HospitalAdminSectionId }) {
  const queryClient = useQueryClient();
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const queryKey = ["hospital-admin", hospitalId];
  const configurationQueryKey = ["hospital-admin-configuration", hospitalId];
  const needsBootstrap = activeSection === "invitar" || activeSection === "personal";
  const query = useQuery({ queryKey, queryFn: () => adminCall<Bootstrap>({ operation: "bootstrap", hospitalId }), enabled: needsBootstrap });
  const configurationQuery = useQuery({
    queryKey: configurationQueryKey,
    queryFn: () => adminCall<HospitalConfiguration>({ operation: "getConfiguration", hospitalId }),
    enabled: activeSection === "configuracion",
    refetchInterval: 30_000,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: configurationQueryKey }),
    ]);
  };
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
    configure.reset();
    await Promise.all([
      refresh(),
      queryClient.invalidateQueries({ queryKey: ["doctor"] }),
    ]);
  };
  const loadSectorSessions = (sectorId: number) => adminCall<MedicalSession[]>({ operation: "sectorSessions", hospitalId, sectorId });
  const closeMedicalSession = (sectorId: number, sessionId: number) => adminCall<MedicalSession>({ operation: "closeMedicalSession", hospitalId, sectorId, sessionId });
  const selectedSection = hospitalAdminSections.find((section) => section.id === activeSection)!;
  const pendingInvitations = query.data?.invitaciones.filter((item) => item.estado === "PENDIENTE") ?? [];
  const invitationHistory = query.data?.invitaciones.filter((item) => item.estado !== "PENDIENTE") ?? [];
  const renderInvitation = (item: Invitation) => <div className="record-row" key={item.id}><div><strong>{item.email}</strong><span>{item.roles.map((role) => roleLabel[role]).join(", ")} · {item.estado}{item.estado === "PENDIENTE" ? (item.emailEnviado ? " · correo enviado" : " · entrega pendiente") : ""}{item.matricula ? ` · Matrícula ${item.tipoMatricula?.toLocaleLowerCase("es")} ${item.matricula} (${item.jurisdiccionMatricula})` : ""}</span></div>{item.estado === "PENDIENTE" || item.estado === "EXPIRADA" ? <div className="record-actions"><button className="button button-secondary" disabled={resend.isPending || revoke.isPending || query.isFetching} onClick={() => resend.mutate(item.id)}>{resend.isPending && resend.variables === item.id ? "Reenviando…" : "Reenviar"}</button>{item.estado === "PENDIENTE" ? <button className="button button-danger-ghost" disabled={revoke.isPending || resend.isPending || query.isFetching} onClick={() => revoke.mutate(item.id)}>{revoke.isPending && revoke.variables === item.id ? "Revocando…" : "Revocar"}</button> : null}</div> : null}</div>;
  return <StaffShell role="Administración" userName={userName} section={selectedSection.label} sectionNavigation={<HospitalAdminNavigation hospitalId={hospitalId} activeSection={activeSection} />} hospitalId={hospitalId} hospitalName={hospitalName} roles={roles} canSwitchHospital={canSwitchHospital}><div className="page-stack admin-workspace">
    <header className="page-heading"><p className="eyebrow">Administración hospitalaria</p><h1>{selectedSection.label}</h1><p>{selectedSection.description}</p></header>
    {needsBootstrap && query.isLoading ? <div className="loading-card" role="status">Cargando administración…</div> : null}
    {needsBootstrap && query.error ? <div className="notice notice-error" role="alert">{query.error.message}</div> : null}
    {activeSection === "invitar" ? <>
      <section className="panel"><div className="panel-heading"><div><h2 tabIndex={-1}>Nueva invitación</h2><p>El acceso solo se activa cuando la persona acepta.</p></div></div><StaffInvitationForm configurationHref={`/admin/hospital/configuracion?hospitalId=${hospitalId}`} configuration={query.data?.configuracion} disabled={invite.isPending} error={invite.error} deliveryMessage={deliveryMessage} createdToken={createdToken} onSubmit={async (invitation) => { setCreatedToken(null); setDeliveryMessage(null); await invite.mutateAsync(invitation); }} /></section>
      <section className="panel">
        <div className="panel-heading"><div><h2 tabIndex={-1}>Invitaciones pendientes</h2><p>Reenviá la invitación o revocala si ya no hace falta.</p></div></div>
        {query.data && (pendingInvitations.length === 0
          ? <p className="notice notice-info">No hay invitaciones pendientes.</p>
          : <div className="record-list">{pendingInvitations.map(renderInvitation)}</div>)}
      </section>
      {query.data && (
        <details className={`panel ${styles.invitationHistory}`}>
          <summary className={styles.invitationHistorySummary}><span><strong>Historial de invitaciones</strong><span className={styles.invitationHistoryCount}>{invitationHistory.length}</span></span><span className={styles.invitationHistoryToggle} aria-hidden="true" /></summary>
          {invitationHistory.length === 0
            ? <p className="notice notice-info">Todavía no hay invitaciones en el historial.</p>
            : <div className="record-list">{invitationHistory.map(renderInvitation)}</div>}
        </details>
      )}
    </> : null}
    {activeSection === "configuracion" ? <HospitalConfigurationPanel hospitalId={hospitalId} configuration={configurationQuery.data} pending={configure.isPending || (configurationQuery.isFetching && !configurationQuery.data)} error={configure.error ?? configurationQuery.error} configure={(operation, onSuccess, onError) => configure.mutate(operation, { onSuccess, onError })} loadSectorSessions={loadSectorSessions} closeMedicalSession={closeMedicalSession} refreshAfterSessionClose={refreshAfterSessionClose} /> : null}
    {activeSection === "personal" ? <HospitalPersonnelPanel hospitalId={hospitalId} personnel={query.data?.personal ?? []} pending={query.isFetching || !query.data} refresh={refresh} /> : null}
    {activeSection === "discrepancias" ? <HospitalDiscrepanciesPanel key={hospitalId} hospitalId={hospitalId} /> : null}
  </div></StaffShell>;
}
