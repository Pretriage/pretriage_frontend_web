"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { StaffShell } from "@/components/staff-shell";
import { apiClient } from "@/lib/api/client";
import { aplicaEmbarazo, EMBARAZO_NO_APLICA } from "@/lib/embarazo";
import { NIVELES_GRAVEDAD_BOT, nivelGravedadClass, nivelGravedadLabel } from "@/lib/severity";
import type {
  ConsultationClinicalData,
  ConsultationPretriage,
  DoctorBootstrap,
  MedicalRoom,
  MedicalSector,
  MedicalSession,
  QueueConsultation,
  SymptomsDiscrepancy,
} from "@/lib/api/types";
import type { HospitalRole } from "@/lib/staff-context";
import { ClinicalHistory } from "./clinical-history";
import styles from "./doctor-workspace.module.css";

const doctorApi = "/api/staff/doctor";

function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div className="notice notice-error" role="alert">
      {error instanceof Error ? error.message : "No pudimos completar la operación."}
    </div>
  ) : null;
}

function stateLabel(value?: string) {
  return ({
    EN_COLA: "En cola",
    EN_REVISION: "En revisión",
    LLAMADO: "Llamado",
    EN_ESPERA: "En espera",
    ATRASADO: "Atrasado",
    EN_ATENCION: "En atención",
    FINALIZADA: "Finalizada",
    CANCELADA: "Cancelada",
  }[value ?? ""] ?? value ?? "Sin estado");
}

function patientName(consultation: QueueConsultation) {
  return [consultation.nombrePaciente, consultation.apellidoPaciente]
    .filter(Boolean)
    .join(" ") || "Nombre no disponible";
}

function priorityLabel(value?: string) {
  return nivelGravedadLabel(value) ?? value ?? "Sin definir";
}

function priorityClass(value?: string) {
  return nivelGravedadClass(value) ?? "priority-unknown";
}

function listText(value?: string[]) {
  return value?.length ? value.join(", ") : "No informado";
}

function PretriageSummary({ data, children, secondaryAction, generoBiologico }: { data: ConsultationPretriage; children?: React.ReactNode; secondaryAction?: React.ReactNode; generoBiologico?: string | null }) {
  const summary = data.resumenClinico;
  // El embarazo sólo se muestra para pacientes de género biológico femenino.
  // Si todavía no se conoce el género, se oculta cuando el dato indica que no aplica.
  const embarazo = summary?.posibilidadEmbarazo?.trim();
  const mostrarEmbarazo = Boolean(embarazo) && (generoBiologico
    ? aplicaEmbarazo(generoBiologico)
    : embarazo!.toLowerCase() !== EMBARAZO_NO_APLICA);
  return (
    <section className="priority-review" aria-labelledby="priority-review-title">
      <div className="priority-review-heading">
        <div>
          <span className="eyebrow">Preclasificación</span>
          <h2 id="priority-review-title" tabIndex={-1}>Resumen para la atención</h2>
        </div>
        <div className={styles.summaryCorner}>
          {data.cierreParcial ? (
            <div className="priority-review-heading">
              <span className="status-chip">Entrevista parcial</span>
              <span className="priority-badge">{priorityLabel(data.prioridadPreliminar)}</span>
            </div>
          ) : (
              <span className="priority-badge">{priorityLabel(data.prioridadPreliminar)}</span>
          )}
          {secondaryAction}
        </div>
      </div>
      {summary ? (
        <dl className="clinical-summary">
          <div><dt>Motivo</dt><dd>{summary.motivoConsulta ?? "No informado"}</dd></div>
          <div><dt>Síntomas</dt><dd>{listText(summary.sintomas)}</dd></div>
          <div><dt>Inicio y evolución</dt><dd>{[summary.inicio, summary.evolucion].filter(Boolean).join(" · ") || "No informado"}</dd></div>
          {summary.intensidadDolor != null ? <div><dt>Dolor</dt><dd>{summary.intensidadDolor}/10</dd></div> : null}
          {summary.signosAlarma?.length ? <div><dt>Signos de alarma</dt><dd>{listText(summary.signosAlarma)}</dd></div> : null}
          {summary.antecedentesRelevantes?.length ? <div><dt>Antecedentes relevantes</dt><dd>{listText(summary.antecedentesRelevantes)}</dd></div> : null}
          {summary.medicamentos?.length ? <div><dt>Medicamentos declarados</dt><dd>{listText(summary.medicamentos)}</dd></div> : null}
          {summary.alergias?.length ? <div><dt>Alergias declaradas</dt><dd>{listText(summary.alergias)}</dd></div> : null}
          {mostrarEmbarazo ? <div><dt>Posibilidad de embarazo</dt><dd>{embarazo}</dd></div> : null}
          {summary.observaciones ? <div><dt>Observaciones</dt><dd>{summary.observaciones}</dd></div> : null}
        </dl>
      ) : data.cierreParcial ? (
        <>
          <div className="notice notice-warning">
            La entrevista terminó antes de completar la clasificación automática. La prioridad operativa inicial de la cola es provisional: {priorityLabel(data.prioridadPreliminar)}.
          </div>
          {data.mensajesConversacion?.length ? (
            <div className="clinical-summary">
              <strong>Conversación para contexto</strong>
              <ol>
                {data.mensajesConversacion.map((mensaje, index) => (
                  <li key={`${mensaje.fechaHoraEnvio ?? "mensaje"}-${index}`}>
                    <strong>{mensaje.autor === "PACIENTE" ? "Paciente" : "Asistente"}:</strong>{" "}
                    {mensaje.contenido}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      ) : (
        <div className="notice notice-warning">No hay un resumen clínico estructurado disponible para esta consulta.</div>
      )}
      {children}
    </section>
  );
}

export function DoctorWorkspace({
  userName,
  hospitalId,
  hospitalName,
  roles,
  canSwitchHospital,
}: {
  userName: string;
  hospitalId: number;
  hospitalName: string;
  roles: HospitalRole[];
  canSwitchHospital: boolean;
}) {
  const queryClient = useQueryClient();
  const [assignmentKey, setAssignmentKey] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [priorityPanel, setPriorityPanel] = useState<{
    consultationId: number;
    view: "actions" | "correction";
  } | null>(null);
  const [correctedPriority, setCorrectedPriority] = useState("");
  const [priorityReason, setPriorityReason] = useState("");
  const [reportingConsultationId, setReportingConsultationId] = useState<number | null>(null);

  const bootstrap = useQuery({
    queryKey: ["doctor", "bootstrap"],
    queryFn: () => apiClient<DoctorBootstrap>(doctorApi, "bootstrap"),
  });
  const session = bootstrap.data?.session ?? null;
  const current = bootstrap.data?.currentConsultation ?? null;
  const priorityView = priorityPanel?.consultationId === current?.consultaId ? priorityPanel?.view : undefined;
  const reportingDiscrepancy = reportingConsultationId !== null && reportingConsultationId === current?.consultaId;
  const openPriorityPanel = (view: "actions" | "correction") => {
    if (!current?.consultaId) return;
    if (priorityPanel?.consultationId !== current.consultaId) {
      setCorrectedPriority("");
      setPriorityReason("");
    }
    setPriorityPanel({ consultationId: current.consultaId, view });
  };
  const selected = current?.estadoConsulta === "EN_REVISION";
  const called = current?.estadoConsulta === "LLAMADO";
  const inAttention = current?.estadoConsulta === "EN_ATENCION";
  const pretriageAvailable = Boolean(session?.id && current?.consultaId && (selected || called || inAttention));
  // Los datos clínicos y adjuntos se muestran en revisión, mientras el paciente está llamado y durante la atención.
  const clinicalDataAvailable = pretriageAvailable;
  const assignments = useMemo(
    () => bootstrap.data?.assignments.filter((item) => item.hospitalId === hospitalId) ?? [],
    [bootstrap.data?.assignments, hospitalId],
  );
  const selectedAssignment = useMemo(() => {
    const targetHospitalId = session?.hospitalId ?? hospitalId;
    const targetSpecialty = session?.codigoEspecialidad ?? assignmentKey;
    return bootstrap.data?.assignments.find(
      (item) =>
        item.hospitalId === targetHospitalId &&
        item.codigoEspecialidad === targetSpecialty,
    );
  }, [assignmentKey, bootstrap.data?.assignments, hospitalId, session]);
  const activeHospitalName = session
    ? selectedAssignment?.nombreHospital ?? hospitalName
    : hospitalName;
  const sectors = useQuery({
    queryKey: [
      "doctor",
      "sectors",
      selectedAssignment?.hospitalId,
      selectedAssignment?.codigoEspecialidad,
    ],
    queryFn: () =>
      apiClient<MedicalSector[]>(doctorApi, "sectors", {
        hospitalId: selectedAssignment!.hospitalId,
        specialty: selectedAssignment!.codigoEspecialidad,
      }),
    enabled: Boolean(
      selectedAssignment?.hospitalId && selectedAssignment.codigoEspecialidad,
    ),
  });
  const selectedSector = sectors.data?.find((sector) => String(sector.id) === sectorId);
  const rooms = useQuery({
    queryKey: [
      "doctor",
      "rooms",
      selectedAssignment?.hospitalId,
      selectedAssignment?.codigoEspecialidad,
      selectedSector?.id,
    ],
    queryFn: () =>
      apiClient<MedicalRoom[]>(doctorApi, "rooms", {
        hospitalId: selectedAssignment!.hospitalId,
        sectorId: selectedSector!.id,
        specialty: selectedAssignment!.codigoEspecialidad,
      }),
    enabled: Boolean(
      selectedAssignment?.hospitalId && selectedAssignment.codigoEspecialidad && selectedSector?.id,
    ),
  });
  const selectedRoom = rooms.data?.find((room) => String(room.id) === roomId);
  const queue = useQuery({
    queryKey: ["doctor", "queue", session?.id],
    queryFn: () =>
      apiClient<QueueConsultation[]>(doctorApi, "queue", {
        sessionId: session!.id,
      }),
    enabled: Boolean(session?.id && session.estado === "ACTIVA"),
    refetchInterval: 5_000,
  });
  const pretriage = useQuery({
    queryKey: ["doctor", "pretriage", session?.id, current?.consultaId],
    queryFn: () =>
      apiClient<ConsultationPretriage>(doctorApi, "pretriage", {
        sessionId: session!.id,
        consultationId: current!.consultaId,
      }),
    enabled: pretriageAvailable,
    gcTime: 0,
  });
  const clinicalData = useQuery({
    queryKey: ["doctor", "clinical-data", session?.id, current?.consultaId],
    queryFn: () =>
      apiClient<ConsultationClinicalData | null>(doctorApi, "clinicalData", {
        sessionId: session!.id,
        consultationId: current!.consultaId,
      }),
    enabled: clinicalDataAvailable,
    gcTime: 0,
  });
  const discrepancyKey = ["doctor", "symptoms-discrepancy", session?.id, current?.consultaId];
  const discrepancy = useQuery({
    queryKey: discrepancyKey,
    queryFn: () =>
      apiClient<SymptomsDiscrepancy | null>(doctorApi, "symptomsDiscrepancy", {
        sessionId: session!.id,
        consultationId: current!.consultaId,
      }),
    enabled: pretriageAvailable && inAttention,
    gcTime: 0,
  });

  const updateRemoteState = (
    patch: Pick<DoctorBootstrap, "session" | "currentConsultation">,
  ) => {
    queryClient.setQueryData<DoctorBootstrap>(["doctor", "bootstrap"], (data) =>
      data ? { ...data, ...patch } : data,
    );
  };

  const startSession = useMutation({
    mutationFn: () => {
      if (!selectedAssignment || !selectedSector || !selectedRoom) {
        throw new Error("Seleccioná un sector y un consultorio activos antes de iniciar la sesión.");
      }
      return apiClient<MedicalSession>(doctorApi, "startSession", {
        hospitalId: selectedAssignment?.hospitalId,
        specialty: selectedAssignment?.codigoEspecialidad,
        sectorId: selectedSector.id,
        roomId: selectedRoom.id,
      });
    },
    onSuccess: (created) => {
      updateRemoteState({ session: created, currentConsultation: null });
      setFeedback(null);
    },
  });
  const sessionAction = useMutation({
    mutationFn: (action: "pausar" | "reanudar" | "cerrar") =>
      apiClient<MedicalSession>(doctorApi, "sessionAction", {
        sessionId: session?.id,
        action,
    }),
    onSuccess: (updated) => {
      if (updated.estado === "FINALIZADA") {
        updateRemoteState({ session: null, currentConsultation: null });
        setAssignmentKey("");
        setSectorId("");
        setRoomId("");
      } else {
        updateRemoteState({ session: updated, currentConsultation: null });
      }
      void queryClient.invalidateQueries({ queryKey: ["doctor"] });
    },
  });
  const refreshQueueState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["doctor", "bootstrap"] }),
      queryClient.invalidateQueries({ queryKey: ["doctor", "queue", session?.id] }),
    ]);
  };

  const selectNext = useMutation({
    mutationFn: () =>
      apiClient<QueueConsultation>(doctorApi, "selectNext", {
        sessionId: session?.id,
    }),
    onSuccess: (consultation) => {
      updateRemoteState({ session, currentConsultation: consultation });
      setFeedback(null);
    },
    onSettled: refreshQueueState,
  });
  const consultationAction = useMutation({
    mutationFn: (action: "llamar" | "devolver-a-cola" | "presente" | "ausente" | "finalizar") =>
      apiClient<QueueConsultation>(doctorApi, "consultationAction", {
        sessionId: session?.id,
        consultationId: current?.consultaId,
        action,
      }),
    onSuccess: (updated, action) => {
      if (action === "llamar" || action === "presente") {
        updateRemoteState({ session, currentConsultation: updated });
        setFeedback(action === "presente" ? "Presencia confirmada. La atención quedó iniciada." : null);
      } else {
        updateRemoteState({ session, currentConsultation: null });
        setFeedback({
          "devolver-a-cola": "Paciente devuelto a la cola.",
          ausente: "Paciente marcado como ausente y devuelto a la cola según el flujo configurado.",
          finalizar: "Atención finalizada correctamente.",
        }[action]);
        setPriorityPanel(null);
        setCorrectedPriority("");
        setPriorityReason("");
        setReportingConsultationId(null);
      }
    },
    onSettled: refreshQueueState,
  });
  const reportDiscrepancy = useMutation({
    mutationFn: ({ sessionId, consultationId }: { sessionId: number; consultationId: number }) =>
      apiClient<SymptomsDiscrepancy>(doctorApi, "reportSymptomsDiscrepancy", {
        sessionId,
        consultationId,
      }),
    onSuccess: (record, { sessionId, consultationId }) => {
      queryClient.setQueryData(["doctor", "symptoms-discrepancy", sessionId, consultationId], record);
      setReportingConsultationId(null);
    },
    onSettled: (_record, _error, { sessionId, consultationId }) =>
      queryClient.invalidateQueries({ queryKey: ["doctor", "symptoms-discrepancy", sessionId, consultationId] }),
  });
  const priorityReview = useMutation({
    mutationFn: (review: {
      decision: "CONFIRMAR" | "CORREGIR";
      priority?: string;
      reason?: string;
    }) =>
      apiClient<ConsultationPretriage>(doctorApi, "reviewPriority", {
        sessionId: session?.id,
        consultationId: current?.consultaId,
        ...review,
      }),
    onSuccess: (reviewed) => {
      queryClient.setQueryData(
        ["doctor", "pretriage", session?.id, current?.consultaId],
        reviewed,
      );
      setPriorityPanel(null);
      setCorrectedPriority("");
      setPriorityReason("");
      setFeedback(
        reviewed.estadoRevision === "CONFIRMADA"
          ? "Prioridad confirmada."
          : "Prioridad corregida y registrada.",
      );
    },
  });

  const section = selected ? "Revisión del caso" : current ? "Atenciones" : session ? "Cola de pacientes" : "Inicio";
  const shell = (content: React.ReactNode) => (
    <StaffShell
      canSwitchHospital={canSwitchHospital}
      role="Médico"
      userName={userName}
      section={section}
      sessionLabel={
        session
          ? `${activeHospitalName} · ${session.estado}`
          : activeHospitalName
      }
      hospitalId={hospitalId}
      hospitalName={hospitalName}
      roles={roles}
    >
      {content}
    </StaffShell>
  );

  if (bootstrap.isPending) {
    return shell(<div className="page-center"><div className="loading-card">Preparando tu espacio médico…</div></div>);
  }
  if (bootstrap.isError || !bootstrap.data) {
    return shell(
      <div className="page-center"><section className="panel compact-panel">
        <h1>No pudimos abrir el módulo médico</h1>
        <ErrorNotice error={bootstrap.error} />
        <button className="button button-primary" onClick={() => bootstrap.refetch()}>Reintentar</button>
      </section></div>,
    );
  }
  if (!session) {
    return shell(
      <div className="page-stack narrow-stack">
        <header className="page-heading">
          <p className="eyebrow">Inicio de jornada</p>
          <h1>Iniciar sesión médica</h1>
          <p>Vas a atender en <strong>{activeHospitalName}</strong>. Seleccioná tu especialidad, sector y consultorio.</p>
        </header>
        <section className="panel form-panel">
          <RequiredFieldsNote />
          <div className="field">
            <label htmlFor="doctor-specialty"><RequiredLabel>Especialidad</RequiredLabel></label>
            <SearchableCombobox
              id="doctor-specialty"
              required
              value={assignmentKey}
              placeholder="Seleccioná una especialidad"
              options={assignments.flatMap(({ codigoEspecialidad, nombreEspecialidad }) => codigoEspecialidad
                ? [{ value: codigoEspecialidad, label: nombreEspecialidad ?? codigoEspecialidad }]
                : [])}
              onChange={(value) => { setAssignmentKey(value); setSectorId(""); setRoomId(""); }}
            />
          </div>
          {!assignments.length ? (
            <div className="notice notice-warning">
              No tenés especialidades médicas asignadas en {activeHospitalName}.
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="doctor-sector"><RequiredLabel>Sector</RequiredLabel></label>
            <SearchableCombobox
              id="doctor-sector"
              required
              disabled={!selectedAssignment || sectors.isFetching || !sectors.data?.length}
              value={sectorId}
              placeholder={!selectedAssignment ? "Elegí una especialidad primero" : sectors.isFetching ? "Cargando…" : "Seleccioná un sector"}
              options={(sectors.data ?? []).flatMap(({ id, nombre }) => id === undefined
                ? []
                : [{ value: String(id), label: nombre ?? String(id) }])}
              onChange={(value) => { setSectorId(value); setRoomId(""); }}
            />
          </div>
          {selectedAssignment && !sectors.isPending && sectors.data?.length === 0 ? (
            <div className="notice notice-warning">No hay sectores activos para esta especialidad en {activeHospitalName}. Consultá con la administración del hospital.</div>
          ) : null}
          <div className="field">
            <label htmlFor="doctor-room"><RequiredLabel>Consultorio</RequiredLabel></label>
            <SearchableCombobox
              id="doctor-room"
              required
              disabled={!selectedSector || rooms.isFetching || !rooms.data?.length}
              value={roomId}
              placeholder={!selectedSector ? "Elegí un sector primero" : rooms.isFetching ? "Cargando…" : "Seleccioná un consultorio"}
              options={(rooms.data ?? []).flatMap(({ id, nombre }) => id === undefined
                ? []
                : [{ value: String(id), label: nombre ?? String(id) }])}
              onChange={setRoomId}
            />
          </div>
          {selectedSector && !rooms.isPending && rooms.data?.length === 0 ? (
            <div className="notice notice-warning">No hay consultorios activos en {selectedSector.nombre} para esta especialidad. Consultá con la administración del hospital.</div>
          ) : null}
          <div className="notice notice-info">
            Solo se mostrarán pacientes de {activeHospitalName} para la especialidad, el sector y el consultorio seleccionados.
          </div>
          <button className="button button-primary button-wide" disabled={!selectedAssignment || !selectedSector || !selectedRoom || startSession.isPending} onClick={() => startSession.mutate()}>
            {startSession.isPending ? "Iniciando…" : "Iniciar sesión"}
          </button>
          <ErrorNotice error={sectors.error ?? rooms.error ?? startSession.error} />
        </section>
      </div>,
    );
  }
  if (current) {
    const pretriageData = pretriage.data;
    const reviewPending = pretriageData?.estadoRevision === "PENDIENTE";
    const partialWithoutAiSummary = Boolean(pretriageData?.cierreParcial && !pretriageData.resumenClinico);
    const actionPending = selectNext.isPending || consultationAction.isPending || priorityReview.isPending || reportDiscrepancy.isPending;
    const clinicalHistory = clinicalData.data && session.id && current.consultaId ? (
      <ClinicalHistory
        key={`${session.id}-${current.consultaId}`}
        data={clinicalData.data}
        sessionId={session.id}
        consultationId={current.consultaId}
      />
    ) : clinicalData.isPending ? (
      <div className="loading-card" role="status">Cargando datos clínicos…</div>
    ) : clinicalData.isError ? (
      <div>
        <ErrorNotice error={clinicalData.error} />
        <button className="button button-secondary" disabled={clinicalData.isFetching} onClick={() => clinicalData.refetch()}>Reintentar datos clínicos</button>
      </div>
    ) : null;
    const discrepancyButton = discrepancy.data?.registrada ? (
      <button className={`button button-danger-ghost ${styles.discrepancyAction}`} type="button" disabled aria-label="Declaración falsa ya registrada">Declaración falsa registrada</button>
    ) : discrepancy.data?.puedeRegistrar ? (
      <button className={`button button-danger-ghost ${styles.discrepancyAction}`} type="button" disabled={actionPending} onClick={() => {
        reportDiscrepancy.reset();
        setReportingConsultationId(current.consultaId ?? null);
      }}>
        Marcar declaración falsa
      </button>
    ) : null;
    const priorityControls = inAttention && pretriageData ? (
      <>
        {!reviewPending && !priorityView ? (
          <div className="priority-reviewed">
            <div>
              <strong>{partialWithoutAiSummary
                ? pretriageData.estadoRevision === "CONFIRMADA"
                  ? "Prioridad clínica confirmada por el médico"
                  : "Prioridad clínica ajustada por el médico"
                : pretriageData.estadoRevision === "CONFIRMADA" ? "Prioridad confirmada" : "Prioridad corregida"}</strong>
              <span>{priorityLabel(pretriageData.prioridadEfectiva)}</span>
            </div>
            <div className="priority-actions">
              <button className="button button-secondary" disabled={actionPending} onClick={() => openPriorityPanel("actions")}>Cambiar</button>
            </div>
          </div>
        ) : priorityView === "correction" ? (
          <div className="priority-correction">
            <RequiredFieldsNote />
            <div className="field">
              <label htmlFor="doctor-priority"><RequiredLabel>{partialWithoutAiSummary ? "Prioridad clínica que vas a asignar" : "Nueva prioridad"}</RequiredLabel></label>
              <SearchableCombobox
                id="doctor-priority"
                required
                value={correctedPriority}
                placeholder="Seleccioná una prioridad"
                options={NIVELES_GRAVEDAD_BOT.map((priority) => ({
                  value: priority,
                  label: priorityLabel(priority),
                  disabled: priority === pretriageData.prioridadPreliminar,
                }))}
                onChange={setCorrectedPriority}
              />
            </div>
            <label className="field">
              <span>Motivo breve</span>
              <textarea rows={2} maxLength={500} value={priorityReason} onChange={(event) => setPriorityReason(event.target.value)} placeholder="Ej.: la evaluación clínica no muestra signos de alarma" />
            </label>
            <div className="priority-actions">
              <button className="button button-secondary" disabled={actionPending} onClick={() => openPriorityPanel("actions")}>Cancelar</button>
              <button className="button button-primary" disabled={!correctedPriority || actionPending} onClick={() => priorityReview.mutate({ decision: "CORREGIR", priority: correctedPriority, reason: priorityReason })}>
                {priorityReview.isPending ? "Guardando…" : partialWithoutAiSummary ? "Guardar prioridad clínica" : "Guardar corrección"}
              </button>
            </div>
          </div>
        ) : (
          <div className="priority-decision">
            <p>{partialWithoutAiSummary
              ? "La prioridad operativa inicial es provisional. Confirmá la prioridad clínica que usarás para esta atención o ajustala según tu evaluación."
              : "Antes de finalizar, confirmá si la prioridad preliminar fue correcta."}</p>
            <div className="priority-actions">
              <button className="button button-secondary" disabled={actionPending} onClick={() => openPriorityPanel("correction")}>{partialWithoutAiSummary ? "Ajustar prioridad clínica" : "Modificar prioridad"}</button>
              <button className="button button-primary" disabled={actionPending} onClick={() => priorityReview.mutate({ decision: "CONFIRMAR" })}>
                {priorityReview.isPending ? "Confirmando…" : partialWithoutAiSummary ? "Confirmar prioridad clínica" : "La prioridad es correcta"}
              </button>
            </div>
          </div>
        )}
        <ConfirmationDialog
          open={reportingDiscrepancy && !discrepancy.data?.registrada}
          title="Marcar declaración falsa"
          description="¿Estás seguro? Marcá esta opción solo si considerás que el paciente declaró síntomas falsos de forma intencional. Esta acción aplicará una penalización al paciente."
          confirmLabel="Sí, marcar"
          pendingLabel="Registrando discrepancia…"
          pending={reportDiscrepancy.isPending}
          error={reportDiscrepancy.error}
          focusFallbackId="priority-review-title"
          onConfirm={() => {
            if (!actionPending && discrepancy.data?.puedeRegistrar && session.id && current.consultaId) {
              reportDiscrepancy.mutate({
                sessionId: session.id,
                consultationId: current.consultaId,
              });
            }
          }}
          onCancel={() => {
            setReportingConsultationId(null);
            reportDiscrepancy.reset();
          }}
        />
        {discrepancy.isError ? (
          <div>
            <ErrorNotice error={discrepancy.error} />
            <button className="button button-secondary" disabled={discrepancy.isFetching} onClick={() => discrepancy.refetch()}>Reintentar consulta de discrepancias</button>
          </div>
        ) : null}
      </>
    ) : null;
    return shell(
      <div className="page-stack narrow-stack">
        <header className="page-heading">
          <p className="eyebrow">{selected ? "Revisión antes del llamado" : inAttention ? "Atención en curso" : "Paciente llamado"}</p>
          <h1>{patientName(current)}</h1>
          <p>Código {current.codigoLlamado ?? "no disponible"} · Sala {current.nombreSala ?? session.salaId} · {stateLabel(current.estadoConsulta)}</p>
        </header>
        <section className="panel call-panel">
          <div className="call-visual"><span>Estado</span><strong>{stateLabel(current.estadoConsulta)}</strong><small>Código: {current.codigoLlamado ?? 'No disponible' }</small></div>
          {pretriageAvailable && pretriage.isPending ? (
            <div className="loading-card" role="status">Cargando resumen de pretriage…</div>
          ) : pretriageAvailable && pretriageData ? (
            <PretriageSummary
              data={pretriageData}
              generoBiologico={clinicalData.data?.generoBiologico}
              secondaryAction={inAttention && (reviewPending || priorityView === "actions") ? discrepancyButton : null}
            >
              {priorityControls}
            </PretriageSummary>
          ) : null}
          {pretriageAvailable ? <ErrorNotice error={pretriage.error} /> : null}
          {pretriageAvailable && pretriage.isError && !pretriageData ? (
            <button className="button button-secondary" disabled={pretriage.isFetching} onClick={() => pretriage.refetch()}>Reintentar resumen</button>
          ) : null}
          {clinicalDataAvailable ? clinicalHistory : null}
          {selected ? (
            <div className="call-actions">
              <button className="button button-primary" disabled={actionPending || pretriage.isPending || clinicalData.isPending} onClick={() => consultationAction.mutate("llamar")}>
                {consultationAction.isPending && consultationAction.variables === "llamar" ? "Llamando…" : "Llamar paciente"}
              </button>
              <button className="button button-secondary" disabled={actionPending} onClick={() => consultationAction.mutate("devolver-a-cola")}>
                {consultationAction.isPending && consultationAction.variables === "devolver-a-cola" ? "Devolviendo…" : "Devolver a la cola"}
              </button>
            </div>
          ) : called ? (
            <div className="call-actions">
              <button className="button button-primary" disabled={actionPending} onClick={() => consultationAction.mutate("presente")}>Paciente presente</button>
              <button className="button button-danger-ghost" disabled={actionPending} onClick={() => consultationAction.mutate("ausente")}>Marcar ausente</button>
            </div>
          ) : inAttention ? (
            <>
              <ErrorNotice error={priorityReview.error} />
              <button className="button button-primary" disabled={actionPending || pretriage.isPending || reviewPending || !pretriageData} onClick={() => consultationAction.mutate("finalizar")}>
                {consultationAction.isPending ? "Finalizando…" : "Finalizar atención"}
              </button>
            </>
          ) : null}
          {feedback ? <div className="notice notice-success">{feedback}</div> : null}
          <ErrorNotice error={consultationAction.error} />
        </section>
      </div>,
    );
  }

  return shell(
    <div className="page-stack">
      <header className="page-heading heading-row">
        <div><p className="eyebrow">Sesión {session.estado?.toLowerCase()}</p><h1>Cola de pacientes</h1><p>El orden se actualiza automáticamente cada 5 segundos.</p></div>
        <button className="button button-primary" disabled={session.estado !== "ACTIVA" || selectNext.isPending || consultationAction.isPending || sessionAction.isPending || !queue.data?.length} onClick={() => {
          consultationAction.reset();
          priorityReview.reset();
          reportDiscrepancy.reset();
          selectNext.mutate();
        }}>
          {selectNext.isPending ? "Seleccionando…" : "Seleccionar próximo paciente"}
        </button>
      </header>
      <div className="stat-grid">
        <article className="stat-card"><span>Pacientes disponibles</span><strong>{queue.data?.length ?? 0}</strong></article>
        <article className="stat-card"><span>Especialidad</span><strong className="stat-text">{selectedAssignment?.nombreEspecialidad}</strong></article>
        <article className="stat-card"><span>Sesión</span><strong className={session.estado === "ACTIVA" ? "status-ok" : "status-paused"}>{session.estado}</strong></article>
      </div>
      <section className="panel">
        <div className="panel-heading"><div><h2>Pacientes en cola</h2><p>Seleccioná el próximo paciente para revisar su caso antes de llamarlo.</p></div></div>
        {queue.isPending ? <div className="loading-card">Actualizando cola…</div> : null}
        {queue.data?.length ? (
          <div className="queue-table" role="table" aria-label="Cola médica">
            <div className="queue-row queue-head" role="row"><span>Orden</span><span>Paciente</span><span>Prioridad</span><span>Estado</span></div>
            {queue.data.map((item, index) => (
              <div className="queue-row" role="row" key={item.consultaId}>
                <strong>{index + 1}</strong><strong>{patientName(item)}</strong><span className={`priority-chip ${priorityClass(item.prioridad)}`} data-priority={item.prioridad}>{priorityLabel(item.prioridad)}</span><span className="status-chip">{stateLabel(item.estadoConsulta)}</span>
              </div>
            ))}
          </div>
        ) : !queue.isPending ? <div className="empty-state"><span aria-hidden="true">✓</span><h3>No hay pacientes disponibles</h3><p>La cola se actualizará automáticamente.</p></div> : null}
        <ErrorNotice error={queue.error ?? selectNext.error ?? consultationAction.error} />
      </section>
      {feedback ? <div className="notice notice-success">{feedback}</div> : null}
      <div className="session-controls">
        {session.estado === "ACTIVA" ? (
          <button className="button button-secondary" disabled={sessionAction.isPending || selectNext.isPending || consultationAction.isPending} onClick={() => sessionAction.mutate("pausar")}>Pausar sesión</button>
        ) : (
          <button className="button button-secondary" disabled={sessionAction.isPending} onClick={() => sessionAction.mutate("reanudar")}>Reanudar sesión</button>
        )}
        <button className="button button-danger-ghost" disabled={sessionAction.isPending || selectNext.isPending || consultationAction.isPending} onClick={() => sessionAction.mutate("cerrar")}>Cerrar sesión</button>
        <ErrorNotice error={sessionAction.error} />
      </div>
    </div>,
  );
}
