"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import locations from "@/lib/geo/argentina-locations.json";
import type { HospitalConfiguration } from "./hospital-configuration";
import styles from "./staff-invitation-form.module.css";

export type StaffRole = "ADMIN_HOSPITAL" | "MEDICO" | "RECEPCIONISTA";
export type StaffInvitationDto = {
  email: string;
  roles: StaffRole[];
  matricula: string | null;
  tipoMatricula: string | null;
  jurisdiccionMatricula: string | null;
  especialidadIds: number[];
};

type FormErrors = Partial<Record<"email" | "roles" | "matricula" | "tipoMatricula" | "jurisdiccionMatricula" | "especialidadIds", string>>;
type Props = {
  configuration?: HospitalConfiguration;
  disabled?: boolean;
  error?: Error | null;
  deliveryMessage?: string | null;
  createdToken?: string | null;
  onSubmit: (invitation: StaffInvitationDto) => void | Promise<void>;
};

const roleInfo: Array<{ value: StaffRole; label: string; description: string }> = [
  { value: "RECEPCIONISTA", label: "Recepción", description: "Admisiones, sesiones y triage inicial." },
  { value: "MEDICO", label: "Medicina", description: "Atención médica y revisión de consultas." },
  { value: "ADMIN_HOSPITAL", label: "Administración hospitalaria", description: "Personal, especialidades, sectores y salas." },
];

export function StaffInvitationForm({ configuration, disabled = false, error, deliveryMessage, createdToken, onSubmit }: Props) {
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [matricula, setMatricula] = useState("");
  const [tipoMatricula, setTipoMatricula] = useState("NACIONAL");
  const [jurisdiccion, setJurisdiccion] = useState("");
  const [specialtyIds, setSpecialtyIds] = useState<number[]>([]);
  const [specialtySearch, setSpecialtySearch] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const submitting = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLInputElement>(null);
  const matriculaRef = useRef<HTMLInputElement>(null);
  const tipoRef = useRef<HTMLSelectElement>(null);
  const jurisdictionRef = useRef<HTMLSelectElement>(null);
  const specialtyRef = useRef<HTMLInputElement>(null);
  const specialtyGroupRef = useRef<HTMLFieldSetElement>(null);
  const isMedical = roles.includes("MEDICO");
  const enabledSpecialties = useMemo(() => (configuration?.especialidades ?? []).filter((specialty) => specialty.habilitada), [configuration]);
  const enabledIds = useMemo(() => new Set(enabledSpecialties.map((specialty) => specialty.id)), [enabledSpecialties]);
  const unavailableSpecialtyIds = specialtyIds.filter((id) => !enabledIds.has(id));
  const visibleSpecialties = useMemo(() => {
    const term = enabledSpecialties.length > 8 ? specialtySearch.trim().toLocaleLowerCase("es") : "";
    return term ? enabledSpecialties.filter((specialty) => specialty.nombre.toLocaleLowerCase("es").includes(term)) : enabledSpecialties;
  }, [enabledSpecialties, specialtySearch]);

  function toggleRole(role: StaffRole) {
    setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
  }

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!email.trim()) next.email = "Ingresá un correo electrónico.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Ingresá un correo electrónico válido.";
    if (!roles.length) next.roles = "Seleccioná al menos un rol.";
    if (isMedical) {
      if (!matricula.trim()) next.matricula = "La matrícula es obligatoria para Medicina.";
      if (!tipoMatricula) next.tipoMatricula = "Seleccioná el tipo de matrícula.";
      if (tipoMatricula === "PROVINCIAL" && !jurisdiccion) next.jurisdiccionMatricula = "Seleccioná la provincia.";
      if (!enabledSpecialties.length) next.especialidadIds = "No hay especialidades habilitadas para asignar.";
      else if (specialtyIds.some((id) => !enabledIds.has(id))) next.especialidadIds = "La configuración cambió; revisá las especialidades seleccionadas.";
      else if (!specialtyIds.length) next.especialidadIds = "Seleccioná al menos una especialidad habilitada.";
    }
    return next;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || submitting.current) return;
    const next = validate();
    setErrors(next);
    const first = ["email", "roles", "matricula", "tipoMatricula", "jurisdiccionMatricula", "especialidadIds"].find((key) => next[key as keyof FormErrors]);
    if (first) {
      const targets: Record<string, HTMLElement | null> = { email: emailRef.current, roles: roleRef.current, matricula: matriculaRef.current, tipoMatricula: tipoRef.current, jurisdiccionMatricula: jurisdictionRef.current, especialidadIds: specialtyRef.current };
      (targets[first] ?? (first === "especialidadIds" ? specialtyGroupRef.current : null))?.focus();
      return;
    }
    submitting.current = true;
    try {
      await onSubmit({ email: email.trim(), roles, matricula: isMedical ? matricula.trim() : null, tipoMatricula: isMedical ? tipoMatricula : null, jurisdiccionMatricula: isMedical ? (tipoMatricula === "PROVINCIAL" ? jurisdiccion : "NACION") : null, especialidadIds: isMedical ? specialtyIds : [] });
    } catch {
      // The mutation error is rendered by the parent through the error prop.
    } finally {
      submitting.current = false;
    }
  }

  const invalid = (key: keyof FormErrors) => errors[key] ? "true" : undefined;

  return <form className={styles.form} onSubmit={submit} noValidate>
    <RequiredFieldsNote />
    <div className={styles.section}>
      <label className={styles.field}><RequiredLabel>Correo electrónico</RequiredLabel>
        <input ref={emailRef} name="email" type="email" required value={email} disabled={disabled} onChange={(event) => setEmail(event.target.value)} aria-invalid={invalid("email")} aria-describedby={`invite-email-hint${errors.email ? " invite-email-error" : ""}`} />
      </label>
      <p className={styles.hint} id="invite-email-hint">La persona recibirá la invitación en esta dirección.</p>
      {errors.email ? <p className={styles.error} id="invite-email-error">{errors.email}</p> : null}
    </div>

    <fieldset className={styles.section} disabled={disabled} aria-describedby={`invite-roles-hint${errors.roles ? " invite-roles-error" : ""}`}>
      <legend><RequiredLabel>Roles y permisos</RequiredLabel></legend>
      <p className={styles.hint} id="invite-roles-hint">Seleccioná al menos un rol. Si elegís más de uno, los permisos se combinan. Seleccionados: {roles.length}.</p>
      <div className={styles.roleGrid} aria-describedby={errors.roles ? "invite-roles-error" : undefined}>
        {roleInfo.map((role, index) => <label className={styles.checkCard} key={role.value}>
          <input ref={index === 0 ? roleRef : undefined} type="checkbox" value={role.value} checked={roles.includes(role.value)} onChange={() => toggleRole(role.value)} aria-invalid={index === 0 ? invalid("roles") : undefined} aria-describedby={index === 0 && errors.roles ? "invite-roles-error" : undefined} />
          <span className={styles.checkCopy}><strong>{role.label}</strong><span>{role.description}</span></span>
        </label>)}
      </div>
      {errors.roles ? <p className={styles.error} id="invite-roles-error">{errors.roles}</p> : null}
    </fieldset>

    {isMedical ? <fieldset className={styles.section} disabled={disabled}>
      <legend>Datos profesionales</legend>
      <p className={styles.hint}>Estos datos son obligatorios para quienes tengan el rol Medicina.</p>
      <div className={styles.medicalFields}>
        <label className={styles.field}><RequiredLabel>Matrícula</RequiredLabel>
          <input ref={matriculaRef} required value={matricula} onChange={(event) => setMatricula(event.target.value)} aria-invalid={invalid("matricula")} aria-describedby={errors.matricula ? "invite-matricula-error" : undefined} />
        </label>
        <label className={styles.field}><RequiredLabel>Tipo de matrícula</RequiredLabel>
          <select ref={tipoRef} required value={tipoMatricula} onChange={(event) => setTipoMatricula(event.target.value)} aria-invalid={invalid("tipoMatricula")} aria-describedby={errors.tipoMatricula ? "invite-tipo-error" : undefined}><option value="NACIONAL">Nacional</option><option value="PROVINCIAL">Provincial</option></select>
        </label>
        {errors.matricula ? <p className={styles.error} id="invite-matricula-error">{errors.matricula}</p> : null}
        {errors.tipoMatricula ? <p className={styles.error} id="invite-tipo-error">{errors.tipoMatricula}</p> : null}
      {tipoMatricula === "PROVINCIAL" ? <label className={`${styles.field} ${styles.wide}`}><RequiredLabel>Provincia</RequiredLabel>
          <select ref={jurisdictionRef} required value={jurisdiccion} onChange={(event) => setJurisdiccion(event.target.value)} aria-invalid={invalid("jurisdiccionMatricula")} aria-describedby={errors.jurisdiccionMatricula ? "invite-province-error" : undefined}><option value="">Seleccionar provincia</option>{locations.provinces.map((province) => <option key={province.name} value={province.name}>{province.name}</option>)}</select>
        </label> : null}
        {tipoMatricula === "PROVINCIAL" && errors.jurisdiccionMatricula ? <p className={`${styles.error} ${styles.wide}`} id="invite-province-error">{errors.jurisdiccionMatricula}</p> : null}
      </div>
    </fieldset> : null}

    {isMedical ? <fieldset ref={specialtyGroupRef} tabIndex={-1} className={styles.section} disabled={disabled} aria-describedby={`invite-specialty-hint${errors.especialidadIds ? " invite-specialty-error" : ""}`}>
      <legend><RequiredLabel>Especialidades</RequiredLabel></legend>
      <p className={styles.hint} id="invite-specialty-hint">Elegí al menos una especialidad habilitada en este hospital. Seleccionadas: {specialtyIds.filter((id) => enabledIds.has(id)).length}.</p>
      {unavailableSpecialtyIds.length ? <div className={styles.staleNotice} role="alert">
        {unavailableSpecialtyIds.length === 1 ? "1 especialidad dejó de estar disponible." : `${unavailableSpecialtyIds.length} especialidades dejaron de estar disponibles.`}{" "}
        <button type="button" onClick={() => setSpecialtyIds((current) => current.filter((id) => enabledIds.has(id)))} disabled={disabled}>Quitar especialidades no disponibles</button>
      </div> : null}
      {enabledSpecialties.length ? <>
        {enabledSpecialties.length > 8 ? <label className={styles.search}>Buscar especialidad<input type="search" value={specialtySearch} onChange={(event) => setSpecialtySearch(event.target.value)} placeholder="Ej. clínica" disabled={disabled} /></label> : null}
        <div className={styles.specialtyGrid} aria-describedby={errors.especialidadIds ? "invite-specialty-error" : undefined}>{visibleSpecialties.map((specialty, index) => <label className={styles.checkCard} key={specialty.id}>
        <input ref={index === 0 ? specialtyRef : undefined} type="checkbox" checked={specialtyIds.includes(specialty.id)} onChange={() => setSpecialtyIds((current) => current.includes(specialty.id) ? current.filter((id) => id !== specialty.id) : [...current, specialty.id])} aria-invalid={index === 0 ? invalid("especialidadIds") : undefined} aria-describedby={index === 0 && errors.especialidadIds ? "invite-specialty-error" : undefined} />
        <span className={styles.checkCopy}><strong>{specialty.nombre}</strong></span>
      </label>)}</div></> : <p className={styles.catalogEmpty}>No hay especialidades habilitadas. Podés activarlas desde <a href="#hospital-configuration-heading">Configuración del hospital</a>.</p>}
      {errors.especialidadIds ? <p className={styles.error} id="invite-specialty-error">{errors.especialidadIds}</p> : null}
    </fieldset> : null}

    {error ? <div className="notice notice-error" role="alert">{error.message}</div> : null}
    {deliveryMessage ? <div className={`notice notice-success ${styles.status}`} role="status"><strong>{deliveryMessage}</strong>{createdToken ? <><br />Copiá este secreto una sola vez para la entrega local:<br /><code className="secret-code">{createdToken}</code></> : null}</div> : null}
    <div className={styles.actions}><button className="button button-primary" disabled={disabled} type="submit">{disabled ? "Creando…" : "Crear invitación"}</button></div>
  </form>;
}
