"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { DatePicker } from "@/components/date-picker";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { StaffShell } from "@/components/staff-shell";
import argentinaLocations from "@/lib/geo/argentina-locations.json";
import { apiClient, ClientApiError } from "@/lib/api/client";
import { nivelGravedadLabel } from "@/lib/severity";
import type {
  CreateReceptionAdmission,
  ReceptionAdmission,
  ReceptionAdmissionDetail,
  ReceptionBootstrap,
  ReceptionCoverage,
  ReceptionPatient,
  ReceptionSession,
} from "@/lib/api/types";
import type { HospitalRole } from "@/lib/staff-context";
import { rangoFechaNacimiento } from "@/features/reception/date-format";
import { fechaIsoValida, formatoHoraArgentina } from "@/lib/argentina-date";
import { EVOLUTION_LABELS, ReceptionClinicalForm } from "@/features/reception/reception-clinical-form";
import { ReceptionCoverageStep } from "@/features/reception/reception-coverage-step";
import clinicalStyles from "./reception-clinical-form.module.css";
import {
  clinicalSchema,
  emptyClinicalForm,
  patientSchema,
  restoreClinicalDraft,
  toTriageRequest,
  type ClinicalFormValues,
  type PatientAdmissionValues,
  type PatientFormValues,
} from "@/features/reception/schema";

type Stage = "dashboard" | "search" | "patient" | "coverage" | "triage" | "review" | "done";
type OpenAdmission = ReceptionAdmission & { patientName: string; coverage?: ReceptionCoverage | null };
const receptionApi = "/api/staff/reception";
const provinceOptions = argentinaLocations.provinces.map(({ name }) => name);
const genderOptions = [
  { value: "FEMENINO", label: "Femenino" },
  { value: "MASCULINO", label: "Masculino" },
];

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos completar la operación.";
}

function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div className="notice notice-error" role="alert">{messageFrom(error)}</div>
  ) : null;
}

function FieldError({ message, id }: { message?: string; id?: string }) {
  return message ? <span className="field-error" id={id}>{message}</span> : null;
}

function Progress({ active }: { active: number }) {
  return (
    <ol className="progress" aria-label="Progreso de la admisión">
      {["Paciente", "Cobertura", "Síntomas", "Revisión", "Confirmación"].map((label, index) => (
        <li className={index <= active ? "progress-active" : ""} key={label}>
          <span>{index < active ? "✓" : index + 1}</span>{label}
        </li>
      ))}
    </ol>
  );
}

function draftKey(id: number) {
  return `pretriage:reception-draft:${id}`;
}

function priorityLabel(priority?: string) {
  return nivelGravedadLabel(priority) ?? "Pendiente";
}

function activeAttentionLabel(state?: ReceptionPatient["estadoAtencionEnCurso"]) {
  const labels: Partial<Record<NonNullable<ReceptionPatient["estadoAtencionEnCurso"]>, string>> = {
    PENDIENTE: "Pendiente",
    HOSPITAL_SELECCIONADO: "Hospital seleccionado",
    PRETRIAGE_EN_PROCESO: "Pretriage en proceso",
    PRETRIAGE_FINALIZADO: "Pretriage finalizado",
    EN_COLA: "En cola",
    LLAMADO: "Paciente llamado",
    EN_ESPERA: "En espera",
    ATRASADO: "Paciente demorado",
    EN_ATENCION: "En atención",
  };
  return state ? labels[state] : undefined;
}

function formatTime(value?: string) {
  return formatoHoraArgentina(value) ?? "Sin estimación";
}

function formatEstimate(from?: string, to?: string, estimated?: string) {
  const start = from ?? estimated;
  return `${formatTime(start)}${to ? ` – ${formatTime(to)}` : ""}`;
}

const emptyPatient: PatientFormValues = {
  dni: "", nombre: "", apellido: "", fechaNacimiento: "",
  generoBiologico: "", telefono: "", correoElectronico: "",
  calle: "", alturaDomicilio: "", piso: "", ciudad: "", provincia: "",
  codigoPostal: "", codigoEspecialidad: "",
};

export function ReceptionWorkspace({ userName, hospitalId, hospitalName, roles, canSwitchHospital }: {
  userName: string;
  hospitalId: number;
  hospitalName: string;
  roles: HospitalRole[];
  canSwitchHospital: boolean;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>("dashboard");
  const [patient, setPatient] = useState<ReceptionPatient | null>(null);
  const [searchedDni, setSearchedDni] = useState("");
  const [admission, setAdmission] = useState<OpenAdmission | null>(null);
  const [review, setReview] = useState<ClinicalFormValues | null>(null);
  const [result, setResult] = useState<ReceptionAdmission | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const bootstrap = useQuery({
    queryKey: ["reception", "bootstrap"],
    queryFn: () => apiClient<ReceptionBootstrap>(receptionApi, "bootstrap"),
  });
  const session = bootstrap.data?.session ?? null;
  const activeHospital = useMemo(
    () => bootstrap.data?.hospitals.find((item) => item.id === session?.hospitalId),
    [bootstrap.data?.hospitals, session?.hospitalId],
  );
  const selectedHospital = useMemo(
    () => bootstrap.data?.hospitals.find((item) => item.id === hospitalId),
    [bootstrap.data?.hospitals, hospitalId],
  );
  const patientForm = useForm<PatientFormValues, unknown, PatientAdmissionValues>({
    resolver: zodResolver(patientSchema), defaultValues: emptyPatient,
  });
  const clinicalForm = useForm<ClinicalFormValues>({
    resolver: zodResolver(clinicalSchema), defaultValues: emptyClinicalForm,
  });
  const clinicalDraft = useWatch({ control: clinicalForm.control });
  const selectedProvince = useWatch({ control: patientForm.control, name: "provincia" });
  const province = useMemo(
    () => argentinaLocations.provinces.find((item) =>
      item.name.localeCompare(selectedProvince ?? "", "es-AR", { sensitivity: "base" }) === 0,
    ),
    [selectedProvince],
  );
  const isCaba = province?.name === "Ciudad Autónoma de Buenos Aires";
  const localityLabel = !selectedProvince ? "Localidad o barrio" : isCaba ? "Barrio" : "Localidad";
  const dniForm = useForm<{ dni: string }>({ defaultValues: { dni: "" } });

  useEffect(() => {
    if (!admission?.id || stage !== "triage") return;
    sessionStorage.setItem(draftKey(admission.id), JSON.stringify(clinicalDraft));
  }, [admission?.id, clinicalDraft, stage]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["reception", "bootstrap"] });
  };
  const startSession = useMutation({
    mutationFn: (hospitalId: number) =>
      apiClient<ReceptionSession>(receptionApi, "startSession", { hospitalId }),
    onSuccess: refresh,
  });
  const closeSession = useMutation({
    mutationFn: (sessionId: number) =>
      apiClient<ReceptionSession>(receptionApi, "closeSession", { sessionId }),
    onSuccess: refresh,
  });
  const searchPatient = useMutation({
    mutationFn: (data: { dni: string; sessionId: number }) =>
      apiClient<ReceptionPatient>(receptionApi, "searchPatient", data),
    onSuccess: (found, variables) => {
      if (found.atencionEnCurso) {
        blockActiveAttention(variables.dni, found.estadoAtencionEnCurso);
        return;
      }
      setPatient(found);
      setSearchedDni(variables.dni);
      setSearchError(null);
      patientForm.reset({
        dni: variables.dni,
        nombre: found.nombre ?? "", apellido: found.apellido ?? "",
        fechaNacimiento: fechaIsoValida(found.fechaNacimiento) ? found.fechaNacimiento : "",
        generoBiologico: found.generoBiologico === "X" ? "" : (found.generoBiologico ?? ""),
        telefono: found.telefono ?? "",
        correoElectronico: found.correoElectronico ?? "",
        calle: found.calle ?? "", alturaDomicilio: found.alturaDomicilio ?? "",
        piso: found.piso ?? "", ciudad: found.ciudad ?? "",
        provincia: found.provincia ?? "",
        codigoPostal: found.codigoPostal ?? "",
        codigoEspecialidad: "",
      });
      setStage("patient");
    },
    onError: (error, variables) => {
      if (error instanceof ClientApiError && error.status === 404) {
        setPatient(null);
        setSearchedDni(variables.dni);
        setSearchError(null);
        patientForm.reset({ ...emptyPatient, dni: variables.dni });
        setStage("patient");
      } else setSearchError(messageFrom(error));
    },
  });
  const createAdmission = useMutation({
    mutationFn: (payload: CreateReceptionAdmission) =>
      apiClient<ReceptionAdmission>(receptionApi, "createAdmission", {
        admission: payload,
      }),
    onSuccess: (created, payload) => {
      setAdmission({ ...created, patientName: `${payload.nombre} ${payload.apellido}`.trim() });
      clinicalForm.reset(emptyClinicalForm);
      setStage(created.pacienteId ? "coverage" : "triage");
      void refresh();
    },
    onError: async (error, payload) => {
      if (!(error instanceof ClientApiError) || error.status !== 409) return;
      const found = await apiClient<ReceptionPatient>(receptionApi, "searchPatient", {
        dni: payload.dni,
        sessionId: payload.sesionId,
      }).catch(() => null);
      if (found?.atencionEnCurso) blockActiveAttention(payload.dni, found.estadoAtencionEnCurso);
    },
  });
  const selectCoverage = useMutation({
    mutationFn: (data: { admissionId: number; credentialId: number | null }) =>
      apiClient<ReceptionCoverage>(receptionApi, "selectCoverage", data),
    onSuccess: (coverage) => {
      setAdmission((current) => current && { ...current, coverage: coverage.credencialId ? coverage : null });
      setStage("triage");
      void refresh();
    },
  });
  const finalizeAdmission = useMutation({
    mutationFn: (data: { admissionId: number; values: ClinicalFormValues }) =>
      apiClient<ReceptionAdmission>(receptionApi, "finalizeAdmission", {
        admissionId: data.admissionId,
        form: toTriageRequest(data.values),
      }),
    onSuccess: (finalized) => {
      if (finalized.id) sessionStorage.removeItem(draftKey(finalized.id));
      setResult(finalized);
      setStage("done");
      void refresh();
    },
  });
  const cancelAdmission = useMutation({
    mutationFn: (admissionId: number) =>
      apiClient<ReceptionAdmissionDetail>(receptionApi, "cancelAdmission", {
        admissionId,
      }),
    onSuccess: (cancelled) => {
      if (cancelled.id) sessionStorage.removeItem(draftKey(cancelled.id));
      resetFlow();
      void refresh();
    },
  });

  function resetFlow() {
    setStage("dashboard"); setPatient(null); setSearchedDni("");
    setAdmission(null); setReview(null); setResult(null); setSearchError(null);
    createAdmission.reset();
    selectCoverage.reset();
    dniForm.reset(); patientForm.reset(emptyPatient);
    clinicalForm.reset(emptyClinicalForm);
  }

  function resumeAdmission(open: ReceptionAdmissionDetail) {
    if (!open.id) return;
    setAdmission({
      id: open.id, consultaId: open.consultaId, pacienteId: open.pacienteId,
      codigoLlamado: open.codigoLlamado, estado: open.estado,
      prioridad: open.prioridad, estimacion: open.estimacion,
      patientName: [open.pacienteNombre, open.pacienteApellido].filter(Boolean).join(" "),
      coverage: open.coberturaConfirmada ? open.cobertura ?? null : undefined,
    });
    const stored = sessionStorage.getItem(draftKey(open.id));
    try {
      clinicalForm.reset(stored ? restoreClinicalDraft(JSON.parse(stored)) : emptyClinicalForm);
    } catch {
      clinicalForm.reset(emptyClinicalForm);
    }
    setStage(open.pacienteId && open.coberturaConfirmada === false ? "coverage" : "triage");
  }

  function submitDni({ dni }: { dni: string }) {
    if (searchPatient.isPending) return;
    setSearchError(null);
    const normalized = dni.replace(/\D/g, "");
    if (!/^\d{7,8}$/.test(normalized)) {
      dniForm.setError("dni", { message: "Ingresá un DNI de 7 u 8 dígitos." });
    } else if (session?.id) {
      searchPatient.mutate({ dni: normalized, sessionId: session.id });
    }
  }

  function blockActiveAttention(dni: string, state: ReceptionPatient["estadoAtencionEnCurso"]) {
    const label = activeAttentionLabel(state);
    setSearchError(`Este paciente ya tiene una atención en curso${label ? `: ${label}` : ""}. Debe finalizarse o cancelarse antes de crear una nueva admisión.`);
    setPatient(null);
    setSearchedDni("");
    dniForm.reset({ dni });
    patientForm.reset(emptyPatient);
    setStage("search");
  }

  function submitPatient(valores: PatientAdmissionValues) {
    if (!session?.id || createAdmission.isPending) return;
    createAdmission.mutate({
      sesionId: session.id, ...valores,
      piso: valores.piso || undefined,
    });
  }

  const shell = (content: React.ReactNode, section = "Inicio") => (
    <StaffShell
      canSwitchHospital={canSwitchHospital}
      role="Recepción" userName={userName} section={section}
      sessionLabel={session ? `${session.hospitalNombre ?? "Hospital"} · Activa` : undefined}
      hospitalId={session?.hospitalId ?? hospitalId}
      hospitalName={session?.hospitalNombre ?? hospitalName}
      roles={roles}
    >
      {content}
    </StaffShell>
  );

  if (bootstrap.isPending) {
    return shell(<div className="page-center"><div className="loading-card">Preparando recepción…</div></div>);
  }
  if (bootstrap.isError || !bootstrap.data) {
    return shell(
      <div className="page-center"><section className="panel compact-panel">
        <h1>No pudimos abrir recepción</h1>
        <ErrorNotice error={bootstrap.error} />
        <button className="button button-primary" onClick={() => bootstrap.refetch()}>Reintentar</button>
      </section></div>,
    );
  }
  if (!session) {
    return shell(
      <div className="page-stack">
        <header className="page-heading">
          <p className="eyebrow">Inicio de jornada</p>
          <h1>Hola, {userName.split(" ")[0]}</h1>
          <p>Iniciá la jornada en {hospitalName}.</p>
        </header>
        <div className="hospital-grid">
          {selectedHospital ? [selectedHospital].map((hospital) => (
            <article className="hospital-card" key={hospital.id}>
              <div className="hospital-icon" aria-hidden="true">H</div>
              <h2>{hospital.nombre}</h2>
              <p>{(hospital.especialidades ?? []).map((item) => item.nombre).filter(Boolean).join(" · ") || "Sin especialidades informadas"}</p>
              <button
                className="button button-primary button-wide"
                disabled={startSession.isPending || !hospital.id}
                onClick={() => hospital.id && startSession.mutate(hospital.id)}
              >{startSession.isPending ? "Iniciando…" : "Iniciar sesión"}</button>
            </article>
          )) : null}
        </div>
        {!selectedHospital ? <div className="notice notice-info">Este hospital ya no está disponible para tu cuenta.</div> : null}
        <ErrorNotice error={startSession.error} />
      </div>,
    );
  }
  if (stage === "dashboard") {
    return shell(
      <div className="page-stack">
        <header className="page-heading heading-row">
          <div><p className="eyebrow">Sesión activa</p><h1>Recepción en {session.hospitalNombre}</h1><p>Registrá pacientes y retomá admisiones abiertas.</p></div>
          <button className="button button-primary" onClick={() => setStage("search")}>Nueva admisión</button>
        </header>
        <div className="stat-grid">
          <article className="stat-card"><span>Admisiones abiertas</span><strong>{bootstrap.data.openAdmissions.length}</strong></article>
          <article className="stat-card"><span>Hospital</span><strong className="stat-text">{session.hospitalNombre}</strong></article>
          <article className="stat-card"><span>Estado</span><strong className="status-ok">Activa</strong></article>
        </div>
        <section className="panel">
          <div className="panel-heading"><div><h2>Admisiones en curso</h2><p>Los borradores clínicos se conservan solo en este dispositivo.</p></div></div>
          {bootstrap.data.openAdmissions.length ? (
            <div className="record-list">
              {bootstrap.data.openAdmissions.map((open) => (
                <article className="record-row" key={open.id}>
                  <div><strong>{open.pacienteNombre} {open.pacienteApellido}</strong><span>{open.especialidadNombre} · {open.estado}</span></div>
                  <button className="button button-secondary" onClick={() => resumeAdmission(open)}>Retomar</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state"><span aria-hidden="true">✓</span><h3>No hay admisiones pendientes</h3><p>Podés comenzar una nueva admisión presencial.</p></div>
          )}
        </section>
        <div className="danger-zone">
          <button
            className="button button-danger-ghost"
            disabled={closeSession.isPending}
            onClick={() => session.id && closeSession.mutate(session.id)}
          >Cerrar sesión de recepción</button>
          <ErrorNotice error={closeSession.error} />
        </div>
      </div>,
    );
  }
  if (stage === "search") {
    return shell(
      <div className="page-stack narrow-stack">
        <Progress active={0} />
        <header className="page-heading"><p className="eyebrow">Nueva admisión</p><h1>Buscar paciente</h1><p>Usá el DNI físico para encontrar o registrar al paciente.</p></header>
        <form className="panel form-panel" onSubmit={dniForm.handleSubmit(submitDni)}>
          <RequiredFieldsNote />
          <label className="field"><RequiredLabel>DNI</RequiredLabel><input aria-required="true" autoFocus disabled={searchPatient.isPending} inputMode="numeric" placeholder="Ej. 12345678" {...dniForm.register("dni", { onChange: () => setSearchError(null) })} /><FieldError message={dniForm.formState.errors.dni?.message} /></label>
          {searchError ? <div className="notice notice-error" role="alert">{searchError}</div> : null}
          <div className="form-actions">
            <button className="button button-secondary" disabled={searchPatient.isPending} type="button" onClick={resetFlow}>Cancelar</button>
            <button className="button button-primary" disabled={searchPatient.isPending} type="submit">{searchPatient.isPending ? "Buscando…" : "Buscar paciente"}</button>
          </div>
        </form>
      </div>,
      "Pacientes",
    );
  }
  if (stage === "patient") {
    const specialties = (activeHospital?.especialidades ?? []).flatMap(({ codigo, nombre }) =>
      codigo ? [{ value: codigo, label: nombre ?? codigo }] : [],
    );
    const birthDateRange = rangoFechaNacimiento();
    const missingDetails = patient ? [
      !fechaIsoValida(patient.fechaNacimiento) ? "fecha de nacimiento" : null,
      !patient.generoBiologico || patient.generoBiologico === "X" ? "género biológico" : null,
      !patient.telefono?.trim() ? "teléfono" : null,
    ].filter((item) => item !== null) : [];
    return shell(
      <div className="page-stack">
        <Progress active={0} />
        <header className="page-heading">
          <p className="eyebrow">{patient ? "Paciente encontrado" : "Nuevo paciente"}</p>
          <h1>Datos del paciente</h1>
          <p>{patient ? "Verificá los datos antes de crear la admisión." : `No encontramos coincidencias para el DNI ${searchedDni}.`}</p>
        </header>
        <form className="form-panel" onSubmit={patientForm.handleSubmit(submitPatient)} noValidate>
          <section className="panel form-panel" aria-labelledby="reception-specialty-heading">
            <div className="panel-heading">
              <div><h2 id="reception-specialty-heading">Especialidad de esta atención</h2><p>Elegí una especialidad para la nueva admisión.</p></div>
            </div>
            <RequiredFieldsNote />
            <div className="field">
              <label htmlFor="reception-specialty"><RequiredLabel>Especialidad</RequiredLabel></label>
              <Controller control={patientForm.control} name="codigoEspecialidad" render={({ field, fieldState }) => (
                <SearchableCombobox
                  {...field}
                  id="reception-specialty"
                  options={specialties}
                  placeholder="Seleccioná una especialidad"
                  aria-required="true"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.error ? "reception-specialty-error" : undefined}
                />
              )} />
              <FieldError id="reception-specialty-error" message={patientForm.formState.errors.codigoEspecialidad?.message} />
            </div>
          </section>
          <section className="panel form-panel" aria-labelledby="reception-patient-heading">
            <div className="panel-heading">
              <div><h2 id="reception-patient-heading">Datos personales y domicilio</h2>{patient ? <p>Revisá los datos guardados y corregí lo que haga falta.</p> : null}</div>
            </div>
            {missingDetails.length ? <p className="notice notice-info">Todavía falta registrar {new Intl.ListFormat("es-AR").format(missingDetails)}.</p> : null}
            <div className="form-grid">
              <label className="field"><RequiredLabel>Nombre</RequiredLabel><input aria-required="true" {...patientForm.register("nombre")} /><FieldError message={patientForm.formState.errors.nombre?.message} /></label>
              <label className="field"><RequiredLabel>Apellido</RequiredLabel><input aria-required="true" {...patientForm.register("apellido")} /><FieldError message={patientForm.formState.errors.apellido?.message} /></label>
              <label className="field"><RequiredLabel>DNI</RequiredLabel><input aria-required="true" readOnly {...patientForm.register("dni")} /><FieldError message={patientForm.formState.errors.dni?.message} /></label>
              <div className="field">
                <label htmlFor="reception-birth-date"><RequiredLabel>Fecha de nacimiento</RequiredLabel></label>
                <Controller control={patientForm.control} name="fechaNacimiento" render={({ field, fieldState }) => (
                  <DatePicker
                    {...field}
                    {...birthDateRange}
                    id="reception-birth-date"
                    required
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.error ? "reception-birth-date-error" : undefined}
                  />
                )} />
                <FieldError id="reception-birth-date-error" message={patientForm.formState.errors.fechaNacimiento?.message} />
              </div>
              <div className="field">
                <label htmlFor="reception-gender"><RequiredLabel>Género biológico</RequiredLabel></label>
                <Controller control={patientForm.control} name="generoBiologico" render={({ field, fieldState }) => (
                  <SearchableCombobox
                    {...field}
                    id="reception-gender"
                    options={genderOptions}
                    placeholder="Seleccioná una opción"
                    aria-required="true"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.error ? "reception-gender-error" : undefined}
                  />
                )} />
                <FieldError id="reception-gender-error" message={patientForm.formState.errors.generoBiologico?.message} />
              </div>
              <label className="field"><RequiredLabel>Teléfono</RequiredLabel><input aria-required="true" type="tel" {...patientForm.register("telefono")} /><FieldError message={patientForm.formState.errors.telefono?.message} /></label>
              <label className="field"><span>Correo electrónico</span><input type="email" {...patientForm.register("correoElectronico")} /><FieldError message={patientForm.formState.errors.correoElectronico?.message} /></label>
              <label className="field field-wide"><RequiredLabel>Calle</RequiredLabel><input aria-required="true" {...patientForm.register("calle")} /><FieldError message={patientForm.formState.errors.calle?.message} /></label>
              <label className="field"><RequiredLabel>Altura</RequiredLabel><input aria-required="true" {...patientForm.register("alturaDomicilio")} /><FieldError message={patientForm.formState.errors.alturaDomicilio?.message} /></label>
              <label className="field"><span>Piso</span><input {...patientForm.register("piso")} /></label>
              <div className="field">
                <label htmlFor="reception-province"><RequiredLabel>Provincia</RequiredLabel></label>
                <Controller control={patientForm.control} name="provincia" render={({ field, fieldState }) => (
                  <SearchableCombobox
                    {...field}
                    id="reception-province"
                    allowCustomValue
                    options={provinceOptions}
                    placeholder="Buscar provincia"
                    aria-required="true"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.error ? "reception-province-error" : undefined}
                    onChange={(value) => {
                      if (value === field.value) return;
                      field.onChange(value);
                      patientForm.setValue("ciudad", "", { shouldDirty: true });
                    }}
                  />
                )} />
                <FieldError id="reception-province-error" message={patientForm.formState.errors.provincia?.message} />
              </div>
              <div className="field">
                <label htmlFor="reception-locality"><RequiredLabel>{localityLabel}</RequiredLabel></label>
                <Controller control={patientForm.control} name="ciudad" render={({ field, fieldState }) => (
                  <SearchableCombobox
                    {...field}
                    id="reception-locality"
                    allowCustomValue
                    options={province?.cities ?? []}
                    disabled={!selectedProvince}
                    placeholder={!selectedProvince ? "Seleccioná primero una provincia" : isCaba ? "Buscar barrio" : "Buscar localidad"}
                    aria-required="true"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.error ? "reception-locality-error" : undefined}
                  />
                )} />
                <FieldError id="reception-locality-error" message={patientForm.formState.errors.ciudad?.message} />
              </div>
              <label className="field"><span>Código postal</span><input {...patientForm.register("codigoPostal")} /></label>
            </div>
            <div className="form-actions">
              <button className="button button-secondary" disabled={createAdmission.isPending} type="button" onClick={resetFlow}>Cancelar admisión</button>
              <button className="button button-primary" disabled={createAdmission.isPending} type="submit">
                {createAdmission.isPending ? "Creando…" : "Crear admisión"}
              </button>
            </div>
            <ErrorNotice error={createAdmission.error} />
          </section>
        </form>
      </div>,
      "Admisiones",
    );
  }
  if (stage === "coverage" && admission?.pacienteId) {
    return shell(
      <div className="page-stack">
        <Progress active={1} />
        <ReceptionCoverageStep
          patientId={admission.pacienteId}
          patientName={admission.patientName || "Paciente"}
          initialCredentialId={admission.coverage === null ? null : admission.coverage?.credencialId}
          onContinue={(credentialId) => admission.id && selectCoverage.mutate({ admissionId: admission.id, credentialId })}
          onCancel={() => admission.id && cancelAdmission.mutate(admission.id)}
          isCancelling={cancelAdmission.isPending}
          isContinuing={selectCoverage.isPending}
        />
        <ErrorNotice error={selectCoverage.error ?? cancelAdmission.error} />
      </div>,
      "Admisiones",
    );
  }
  if (stage === "triage") {
    return shell(
      <div className="page-stack narrow-stack">
        <Progress active={2} />
        <header className="page-heading">
          <p className="eyebrow">Admisión #{admission?.id}</p>
          <h1>Motivo y estado actual</h1>
          <p>Registrá lo informado por el paciente una sola vez, sin interpretar.</p>
          {admission?.coverage !== undefined ? <p>Cobertura registrada: {admission.coverage?.nombreObraSocial ?? "Sin cobertura"}.</p> : null}
        </header>
        <ReceptionClinicalForm
          form={clinicalForm}
          onReview={(values) => {
            setReview(values);
            setStage("review");
          }}
          onCancel={() => admission?.id && cancelAdmission.mutate(admission.id)}
          onEditCoverage={admission?.pacienteId ? () => setStage("coverage") : undefined}
          isCancelling={cancelAdmission.isPending}
        />
        <ErrorNotice error={cancelAdmission.error} />
      </div>,
      "Admisiones",
    );
  }
  if (stage === "review" && review) {
    const evolution = Object.entries(EVOLUTION_LABELS).find(([value]) => value === review.evolucion)?.[1] ?? review.evolucion;
    const summary = [
      ["Motivo principal", review.motivoConsulta],
      ["Inicio", review.inicio],
      ["Evolución", evolution],
      ["Otros síntomas", review.sintomas],
      ["Antecedentes relevantes", review.antecedentesRelevantes],
      ["Medicamentos", review.medicamentos],
      ["Alergias", review.alergias],
      ["Posibilidad de embarazo", review.posibilidadEmbarazo === "si" ? "Sí" : review.posibilidadEmbarazo],
      ["Observaciones", review.observaciones],
    ];
    return shell(
      <div className="page-stack">
        <Progress active={3} />
        <header className="page-heading"><p className="eyebrow">Último paso</p><h1>Revisar y finalizar</h1><p>La prioridad se calculará automáticamente y no puede modificarse en recepción.</p></header>
        <section className="review-grid">
          <article className="panel summary-card">
            <h2>Resumen clínico</h2>
            <dl className={`summary-list ${clinicalStyles.summaryList}`}>
              {summary.filter(([, value]) => value.trim()).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </article>
          <aside className="panel decision-card">
            <span className="decision-icon" aria-hidden="true">IA</span>
            <h2>Clasificación automática</h2>
            <p>Al finalizar, el sistema evaluará el formulario completo y ubicará al paciente en la cola.</p>
            <div className="notice notice-info">Verificá que la información coincida con lo expresado por el paciente.</div>
          </aside>
        </section>
        <div className="form-actions">
          <button className="button button-secondary" disabled={finalizeAdmission.isPending} onClick={() => setStage("triage")}>Editar</button>
          <button
            className="button button-primary"
            disabled={finalizeAdmission.isPending}
            onClick={() => admission?.id && finalizeAdmission.mutate({ admissionId: admission.id, values: review })}
          >{finalizeAdmission.isPending ? "Finalizando…" : "Finalizar admisión"}</button>
        </div>
        <ErrorNotice error={finalizeAdmission.error} />
      </div>,
      "Admisiones",
    );
  }
  return shell(
    <div className="page-stack narrow-stack">
      <Progress active={4} />
      <section className="panel success-card">
        <div className="success-icon" aria-hidden="true">✓</div>
        <p className="eyebrow">Admisión confirmada</p>
        <h1>El paciente ingresó a la cola</h1>
        <p>Entregale su código anónimo de llamado y orientalo hacia la sala de espera.</p>
        <div className="confirmation-grid">
          <div className="call-code"><span>Código de llamado</span><strong>{result?.codigoLlamado ?? "—"}</strong></div>
          <div className="priority-result"><span>Prioridad asignada</span><strong>{priorityLabel(result?.prioridad)}</strong></div>
          <div><span>Horario estimado</span><strong>{formatEstimate(
            result?.estimacion?.fechaHoraAtencionEstimadaDesde,
            result?.estimacion?.fechaHoraAtencionEstimadaHasta,
            result?.estimacion?.fechaHoraAtencionEstimada,
          )}</strong></div>
          <div><span>Posición en cola</span><strong>{result?.estimacion?.posicionEnCola ?? "—"}</strong></div>
        </div>
        <button className="button button-primary" onClick={resetFlow}>Registrar otro paciente</button>
      </section>
    </div>,
    "Admisiones",
  );
}
