"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { formatoFechaHoraArgentina } from "@/lib/argentina-date";
import styles from "./hospital-configuration-panel.module.css";
import type { ConfigurationOperation, HospitalConfiguration, MedicalSession, Room, Sector, Specialty } from "./hospital-configuration";

type Configure = (operation: ConfigurationOperation, onSuccess?: () => void, onError?: (error: Error) => void) => void;
type Confirmation =
  | { kind: "sector"; nombre: string; especialidadId: number; especialidadNombre: string }
  | { kind: "specialty"; especialidadId: number; especialidadNombre: string };

type SectorSessionsProps = {
  hospitalId: number;
  sector: Sector;
  load: (sectorId: number) => Promise<MedicalSession[]>;
  close: (sectorId: number, sessionId: number) => Promise<MedicalSession>;
  refreshAfterClose: () => Promise<void>;
};

function SectorSessions({ hospitalId, sector, load, close, refreshAfterClose }: SectorSessionsProps) {
  const queryClient = useQueryClient();
  const queryKey = ["admin-sector-sessions", hospitalId, sector.id];
  const sessionsQuery = useQuery({ queryKey, queryFn: () => load(sector.id) });
  const [selected, setSelected] = useState<MedicalSession | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeMutation = useMutation({
    mutationFn: ({ sectorId, sessionId }: { sectorId: number; sessionId: number }) => close(sectorId, sessionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        refreshAfterClose(),
      ]);
      dialogRef.current?.close();
      setSelected(null);
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("[data-session-cancel]")?.focus();
    } else if (!selected && dialog.open) {
      dialog.close();
    }
  }, [selected]);

  function cancel() {
    if (closeMutation.isPending) return;
    dialogRef.current?.close();
    setSelected(null);
    closeMutation.reset();
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function confirmClose() {
    if (!selected || closeMutation.isPending) return;
    closeMutation.mutate({ sectorId: sector.id, sessionId: selected.id });
  }

  return <div className="form-panel" aria-label={`Sesiones médicas de ${sector.nombre}`}>
    <h4>Sesiones médicas</h4>
    {sessionsQuery.isFetching ? <p role="status">Cargando sesiones del sector…</p> : null}
    {sessionsQuery.error ? <p className="notice notice-error" role="alert">{sessionsQuery.error.message}</p> : null}
    {sessionsQuery.data?.length === 0 ? <p className="notice notice-info">Este sector no tiene sesiones activas o pausadas.</p> : null}
    {sessionsQuery.data?.map((session) => <div className="record-row" key={session.id}>
      <div><strong>{session.medicoNombre}</strong><span>{session.salaNombre ?? "Sin consultorio"} · {session.nombreEspecialidad} · {session.estado} · Inicio {formatoFechaHoraArgentina(session.fechaHoraInicio)}</span></div>
      {session.estado !== "FINALIZADA" ? <button
        className="button button-danger-ghost"
        type="button"
        disabled={closeMutation.isPending || sessionsQuery.isFetching}
        onClick={(event) => { triggerRef.current = event.currentTarget; closeMutation.reset(); setSelected(session); }}
      >Finalizar sesión</button> : null}
    </div>)}
    <dialog ref={dialogRef} className={styles.dialog} onCancel={(event) => { event.preventDefault(); cancel(); }} aria-labelledby={`close-session-title-${sector.id}`}>
      {selected ? <div className={styles.dialogContent}>
        <h2 id={`close-session-title-${sector.id}`}>Finalizar sesión médica</h2>
        <dl className={styles.summary}>
          <div><dt>Médico</dt><dd>{selected.medicoNombre}</dd></div>
          <div><dt>Consultorio</dt><dd>{selected.salaNombre ?? "Sin consultorio"}</dd></div>
          <div><dt>Sector</dt><dd>{selected.sectorNombre}</dd></div>
          <div><dt>Estado actual</dt><dd>{selected.estado}</dd></div>
        </dl>
        <p className="notice notice-info">La sesión quedará en el historial y se liberará el consultorio.</p>
        {closeMutation.error ? <p className="notice notice-error" role="alert">No se pudo finalizar la sesión. {closeMutation.error.message}</p> : null}
        {closeMutation.isPending ? <p role="status">Finalizando la sesión y actualizando la información…</p> : null}
        <div className={styles.actions}>
          <button type="button" className="button button-secondary" data-session-cancel disabled={closeMutation.isPending} onClick={cancel}>Volver</button>
          <button type="button" className="button button-danger-ghost" disabled={closeMutation.isPending} onClick={confirmClose}>Confirmar cierre</button>
        </div>
      </div> : null}
    </dialog>
  </div>;
}

function nameFrom(form: HTMLFormElement, field: string) {
  const input = form.elements.namedItem(field) as HTMLInputElement;
  const name = input.value.trim();
  input.setCustomValidity(name ? "" : "Ingresá un nombre.");
  input.reportValidity();
  return name;
}

function NameField({ name, label, value, disabled }: { name: string; label: string; value?: string; disabled: boolean }) {
  return <label className="field"><RequiredLabel>{label}</RequiredLabel><input name={name} defaultValue={value} required maxLength={100} disabled={disabled} onInput={(event) => event.currentTarget.setCustomValidity("")} /></label>;
}

type ConfigurationFieldProps = {
  name: string;
  label: string;
  placeholder: string;
  initialValue?: string;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  disabled: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
};

function ConfigurationField({ name, label, placeholder, initialValue = "", options, disabled, inputRef }: ConfigurationFieldProps) {
  const id = useId();
  const [value, setValue] = useState(initialValue);
  return (
    <div className="field">
      <label htmlFor={id}><RequiredLabel>{label}</RequiredLabel></label>
      <SearchableCombobox
        id={id}
        name={name}
        ref={inputRef}
        required
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        options={options}
        onChange={setValue}
      />
    </div>
  );
}

function SpecialtyField({ specialties, value, disabled, inputRef }: { specialties: Specialty[]; value?: number; disabled: boolean; inputRef: RefObject<HTMLInputElement | null> }) {
  return (
    <ConfigurationField
      name="specialtyId"
      label="Especialidad"
      placeholder="Seleccioná una especialidad"
      initialValue={specialties.some((item) => item.id === value) ? String(value) : ""}
      disabled={disabled}
      inputRef={inputRef}
      options={specialties.filter((item) => item.habilitada || item.id === value).map((item) => ({
        value: String(item.id),
        label: item.habilitada ? item.nombre : `${item.nombre} (no habilitada)`,
        disabled: !item.habilitada,
      }))}
    />
  );
}

function enabledSpecialtyFrom(data: FormData, specialties: Specialty[], input: HTMLInputElement | null) {
  const specialty = specialties.find((item) => item.id === Number(data.get("specialtyId")) && item.habilitada);
  if (!specialty && input) {
    input.setCustomValidity("Elegí una especialidad habilitada.");
    input.reportValidity();
  }
  return specialty;
}

function RoomForm({ room, sector, pending, specialtyEnabled, configure }: { room?: Room; sector: Sector; pending: boolean; specialtyEnabled: boolean; configure: Configure }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !specialtyEnabled) return;
    const form = event.currentTarget;
    const nombre = nameFrom(form, "roomName");
    if (!nombre) return;
    const payload = { nombre, especialidadId: sector.especialidadId };
    configure(room
      ? { operation: "updateRoom", sectorId: sector.id, roomId: room.id, room: payload }
      : { operation: "createRoom", sectorId: sector.id, room: payload },
    () => { if (!room) form.reset(); });
  }

  return (
    <form className="form-panel admin-room" onSubmit={submit} aria-label={room ? `Sala ${room.nombre}` : `Agregar sala en ${sector.nombre}`}>
      <div className="form-grid">
        <NameField name="roomName" label={room ? "Nombre de la sala" : "Nueva sala"} value={room?.nombre} disabled={pending || !specialtyEnabled} />
        <label className="field">Especialidad de la sala<input value={sector.especialidadNombre} readOnly /></label>
      </div>
      {room && room.especialidadId !== sector.especialidadId ? <p className="notice notice-warning">Esta sala figura con {room.especialidadNombre}. Al guardar, se actualizará a la especialidad del sector.</p> : null}
      <div className="record-actions">
        {room ? <span className="status-chip">{room.activa ? "Activa" : "Inactiva"}</span> : null}
        <button className={room ? "button button-secondary" : "button button-primary"} type="submit" disabled={pending || !specialtyEnabled}>{room ? "Guardar sala" : "Crear sala"}</button>
        {room ? <button className={room.activa ? "button button-danger-ghost" : "button button-secondary"} type="button" disabled={pending || (!room.activa && !specialtyEnabled)} onClick={() => configure({ operation: "setRoomActive", sectorId: sector.id, roomId: room.id, active: !room.activa })}>{room.activa ? "Desactivar sala" : "Activar sala"}</button> : null}
      </div>
    </form>
  );
}

function SectorCard({ hospitalId, sector, rooms, specialties, pending, configure, loadSectorSessions, closeMedicalSession, refreshAfterSessionClose }: { hospitalId: number; sector: Sector; rooms: Room[]; specialties: Specialty[]; pending: boolean; configure: Configure; loadSectorSessions: SectorSessionsProps["load"]; closeMedicalSession: SectorSessionsProps["close"]; refreshAfterSessionClose: SectorSessionsProps["refreshAfterClose"] }) {
  const specialtyEnabled = specialties.some((item) => item.id === sector.especialidadId && item.habilitada);
  const specialtyInput = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const nombre = nameFrom(form, "sectorName");
    if (!nombre) return;
    const data = new FormData(form);
    const specialty = enabledSpecialtyFrom(data, specialties, specialtyInput.current);
    if (!specialty) return;
    configure({ operation: "updateSector", sectorId: sector.id, sector: {
      nombre, especialidadId: specialty.id, activa: data.get("active") === "true",
    } });
  }

  function remove() {
    if (pending) return;
    if (window.confirm(`Se eliminará el sector «${sector.nombre}» y sus ${rooms.length} sala(s). Esta acción no se puede deshacer. ¿Continuar?`)) {
      configure({ operation: "deleteSector", sectorId: sector.id });
    }
  }

  return (
    <section className="admin-sector" aria-labelledby={`sector-${sector.id}`}>
      <div className="panel-heading">
        <div><h3 id={`sector-${sector.id}`}>{sector.nombre}</h3><p>{sector.especialidadNombre} · {rooms.length} sala(s)</p></div>
        <span className="status-chip">{sector.activa ? "Activo" : "Inactivo"}</span>
      </div>
      <form className="form-panel" onSubmit={submit} aria-label={`Editar sector ${sector.nombre}`} key={`${sector.nombre}:${sector.especialidadId}:${sector.activa}`}>
        <div className="form-grid">
          <NameField name="sectorName" label="Nombre del sector" value={sector.nombre} disabled={pending} />
          <SpecialtyField specialties={specialties} value={sector.especialidadId} disabled={pending} inputRef={specialtyInput} />
          <ConfigurationField
            name="active"
            label="Estado"
            placeholder="Seleccioná un estado"
            initialValue={String(sector.activa)}
            options={[{ value: "true", label: "Activo" }, { value: "false", label: "Inactivo" }]}
            disabled={pending}
          />
        </div>
        <p className="notice notice-info">Al guardar un sector inactivo, también se desactivan sus salas. Reactivarlo no vuelve a activar las salas automáticamente.</p>
        {!specialtyEnabled ? <p className="notice notice-warning">Habilitá la especialidad o elegí otra habilitada antes de guardar el sector.</p> : null}
        <div className="record-actions">
          <button className="button button-secondary" type="submit" disabled={pending}>Guardar sector</button>
          <button className="button button-danger-ghost" type="button" disabled={pending} onClick={remove}>Eliminar sector</button>
        </div>
      </form>
      <p className="notice notice-info">Si el sector tiene historial, podés desactivarlo para dejar de usarlo. Cerrar sus sesiones conserva el historial y no habilita su eliminación física.</p>
      <h4>Salas de {sector.nombre}</h4>
      {!sector.activa ? <p className="notice notice-warning">El sector está inactivo y no participa en la asignación de nuevos pacientes.</p> : null}
      {!specialtyEnabled ? <p className="notice notice-warning">Habilitá la especialidad del sector para crear, guardar o activar salas.</p> : null}
      {rooms.length === 0 ? <p className="notice notice-info">Este sector todavía no tiene salas.</p> : null}
      {rooms.map((room) => <RoomForm key={`${room.id}:${room.nombre}:${room.especialidadId}:${room.activa}`} room={room} sector={sector} pending={pending} specialtyEnabled={specialtyEnabled} configure={configure} />)}
      <RoomForm sector={sector} pending={pending} specialtyEnabled={specialtyEnabled} configure={configure} />
      <SectorSessions hospitalId={hospitalId} sector={sector} load={loadSectorSessions} close={closeMedicalSession} refreshAfterClose={refreshAfterSessionClose} />
    </section>
  );
}

export function HospitalConfigurationPanel({ hospitalId, configuration, pending, error, configure, loadSectorSessions, closeMedicalSession, refreshAfterSessionClose }: { hospitalId: number; configuration?: HospitalConfiguration; pending: boolean; error: Error | null; configure: Configure; loadSectorSessions: SectorSessionsProps["load"]; closeMedicalSession: SectorSessionsProps["close"]; refreshAfterSessionClose: SectorSessionsProps["refreshAfterClose"] }) {
  const specialties = configuration?.especialidades ?? [];
  const sectors = configuration?.sectores ?? [];
  const rooms = configuration?.salas ?? [];
  const enabled = specialties.filter((item) => item.habilitada);
  const unavailable = !configuration || !Array.isArray(configuration.sectores);
  const disabled = pending || unavailable;
  const unassignedRooms = rooms.filter((room) => !sectors.some((sector) => sector.id === room.sectorId));
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [confirmationError, setConfirmationError] = useState<Error | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createSpecialtyVersion, setCreateSpecialtyVersion] = useState(0);
  const confirmationDialogRef = useRef<HTMLDialogElement>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const createSpecialtyInput = useRef<HTMLInputElement>(null);
  const disableSpecialtyInput = useRef<HTMLInputElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const confirmationBusyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function restoreConfirmationFocus() {
    window.setTimeout(() => {
      const button = confirmationTriggerRef.current;
      if (button?.isConnected && !button.disabled) button.focus();
      else headingRef.current?.focus();
    }, 0);
  }

  const closeConfirmationDialog = () => {
    if (confirmationBusyRef.current || confirmationBusy || pending) return;
    confirmationDialogRef.current?.close();
    setConfirmation(null);
    setConfirmationError(null);
    setConfirmationBusy(false);
    confirmationBusyRef.current = false;
    restoreConfirmationFocus();
  };

  useEffect(() => {
    const dialog = confirmationDialogRef.current;
    if (!dialog) return;
    if (confirmation && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("[data-dialog-cancel]")?.focus();
    } else if (!confirmation && dialog.open) {
      dialog.close();
    }
  }, [confirmation]);

  function confirmOperation() {
    if (!confirmation || confirmationBusy || confirmationBusyRef.current || pending) return;
    const currentSpecialty = specialties.find((item) => item.id === confirmation.especialidadId);
    if (!currentSpecialty || (confirmation.kind === "sector" && !currentSpecialty.habilitada) || (confirmation.kind === "specialty" && currentSpecialty.habilitada)) {
      setConfirmationError(new Error(confirmation.kind === "sector"
        ? "La especialidad ya no está habilitada. Volvé a editar el sector."
        : "La configuración cambió. Cerrá este diálogo y revisá las especialidades del hospital."));
      return;
    }
    confirmationBusyRef.current = true;
    setConfirmationBusy(true);
    setConfirmationError(null);
    configure(
      confirmation.kind === "sector"
        ? { operation: "createSector", sector: { nombre: confirmation.nombre, especialidadId: confirmation.especialidadId } }
        : { operation: "enableSpecialty", specialtyId: confirmation.especialidadId },
      () => {
        if (confirmation.kind === "sector") {
          createFormRef.current?.reset();
          setCreateSpecialtyVersion((version) => version + 1);
        }
        setConfirmation(null);
        setConfirmationError(null);
        setConfirmationBusy(false);
        setSuccessMessage(confirmation.kind === "sector" ? "Sector creado correctamente." : `${confirmation.especialidadNombre} se agregó a las especialidades del hospital.`);
        confirmationBusyRef.current = false;
        restoreConfirmationFocus();
      },
      (requestError) => {
        setConfirmationError(requestError);
        setConfirmationBusy(false);
        confirmationBusyRef.current = false;
      },
    );
  }

  function createSector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const form = event.currentTarget;
    const nombre = nameFrom(form, "sectorName");
    if (!nombre) return;
    const specialty = enabledSpecialtyFrom(new FormData(form), specialties, createSpecialtyInput.current);
    if (!specialty) return;
    createFormRef.current = form;
    setConfirmationError(null);
    setSuccessMessage(null);
    confirmationTriggerRef.current = createButtonRef.current;
    setConfirmation({ kind: "sector", nombre, especialidadId: specialty.id, especialidadNombre: specialty.nombre });
  }

  function enableSpecialty(specialty: Specialty, trigger: HTMLButtonElement) {
    if (disabled || confirmationBusyRef.current) return;
    confirmationTriggerRef.current = trigger;
    setConfirmationError(null);
    setSuccessMessage(null);
    setConfirmation({ kind: "specialty", especialidadId: specialty.id, especialidadNombre: specialty.nombre });
  }

  function disableSpecialty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const form = new FormData(event.currentTarget);
    const specialty = enabledSpecialtyFrom(form, specialties, disableSpecialtyInput.current);
    if (specialty) configure({ operation: "disableSpecialty", specialtyId: specialty.id });
  }

  return (
    <section className="panel admin-configuration" aria-labelledby="hospital-configuration-heading" aria-busy={pending}>
      <div className="panel-heading"><div><h2 ref={headingRef} tabIndex={-1} id="hospital-configuration-heading">Especialidades, sectores y salas</h2><p>Organizá los sectores del hospital y las salas de cada especialidad.</p></div></div>
      <RequiredFieldsNote />
      {error ? <div className="notice notice-error" role="alert">{error.message}</div> : null}
      {pending ? <p role="status">Guardando cambios y actualizando la configuración…</p> : null}
      {successMessage ? <p className="notice notice-success" role="status">{successMessage}</p> : null}
      {configuration && unavailable ? <p className="notice notice-error" role="alert">No se recibió la información de sectores. Actualizá el servicio antes de configurar las salas.</p> : null}
      <div className="form-panel">
        <h3>Especialidades del hospital</h3>
        <div className="role-options">{specialties.map((specialty) => specialty.habilitada
          ? <span className="status-chip" key={specialty.id}>✓ {specialty.nombre}</span>
          : <button className="button button-secondary" type="button" disabled={disabled} key={specialty.id} onClick={(event) => enableSpecialty(specialty, event.currentTarget)}>Habilitar {specialty.nombre}</button>)}</div>
        {enabled.length > 0 ? <details>
          <summary>Deshabilitar una especialidad del hospital</summary>
          <form className="form-panel admin-room" onSubmit={disableSpecialty} aria-label="Deshabilitar especialidad">
            <p className="notice notice-info">La especialidad dejará de ofrecerse en este hospital. Primero desactivá sus salas en todos los sectores. Podés volver a habilitarla más adelante.</p>
            <div className="form-grid">
              <SpecialtyField specialties={specialties} disabled={disabled} inputRef={disableSpecialtyInput} />
            </div>
            <button className="button button-danger-ghost" type="submit" disabled={disabled}>Deshabilitar especialidad</button>
          </form>
        </details> : null}
      </div>
      <form className="form-panel" onSubmit={createSector} aria-label="Agregar sector">
        <h3>Agregar sector</h3>
        <div className="form-grid">
          <NameField name="sectorName" label="Nombre del sector" disabled={disabled || enabled.length === 0} />
          <SpecialtyField key={createSpecialtyVersion} specialties={specialties} disabled={disabled || enabled.length === 0} inputRef={createSpecialtyInput} />
        </div>
        {enabled.length === 0 && !unavailable ? <p className="notice notice-info">Habilitá una especialidad para crear el primer sector.</p> : null}
        <button ref={createButtonRef} className="button button-primary" type="submit" disabled={disabled || enabled.length === 0}>Crear sector</button>
      </form>
      {!unavailable && sectors.length === 0 ? <p className="notice notice-info">Todavía no hay sectores. Creá uno para agregar sus salas.</p> : null}
      {sectors.map((sector) => <SectorCard key={sector.id} hospitalId={hospitalId} sector={sector} rooms={rooms.filter((room) => room.sectorId === sector.id)} specialties={specialties} pending={disabled} configure={configure} loadSectorSessions={loadSectorSessions} closeMedicalSession={closeMedicalSession} refreshAfterSessionClose={refreshAfterSessionClose} />)}
      {unassignedRooms.length > 0 ? <div className="form-panel"><h3>Salas sin sector disponible</h3><p className="notice notice-warning">Estas salas necesitan una asignación de sector para poder administrarlas. Solicitá la regularización de su configuración.</p>{unassignedRooms.map((room) => <div className="record-row" key={room.id}><strong>{room.nombre}</strong><span>{room.especialidadNombre} · {room.activa ? "Activa" : "Inactiva"}</span></div>)}</div> : null}
      <dialog ref={confirmationDialogRef} className={styles.dialog} onCancel={(event) => { event.preventDefault(); closeConfirmationDialog(); }} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }} aria-labelledby="configuration-dialog-title" aria-describedby="configuration-dialog-note">
        {confirmation ? <div className={styles.dialogContent}>
          <h2 id="configuration-dialog-title">{confirmation.kind === "sector" ? "Crear sector" : "Agregar especialidad"}</h2>
          <dl className={styles.summary}>{confirmation.kind === "sector" ? <div><dt>Nombre</dt><dd>{confirmation.nombre}</dd></div> : null}<div><dt>Especialidad</dt><dd>{confirmation.especialidadNombre}</dd></div></dl>
          <p id="configuration-dialog-note" className="notice notice-info">{confirmation.kind === "sector" ? "Se creará activo. Después podrás agregar sus salas." : "Se habilitará en este hospital para asignarla a sectores y personal médico."}</p>
          {confirmationError ? <p className="notice notice-error" role="alert">{confirmationError.message}</p> : null}
          {confirmationBusy || pending ? <p role="status">{confirmation.kind === "sector" ? "Creando sector y actualizando la configuración…" : "Agregando especialidad y actualizando la configuración…"}</p> : null}
          <div className={styles.actions}>
            <button type="button" className="button button-secondary" data-dialog-cancel disabled={confirmationBusy || pending} onClick={closeConfirmationDialog}>{confirmation.kind === "sector" ? "Volver a editar" : "Cancelar"}</button>
            <button type="button" className="button button-primary" disabled={confirmationBusy || pending} onClick={confirmOperation}>{confirmation.kind === "sector" ? "Confirmar creación" : "Confirmar especialidad"}</button>
          </div>
        </div> : null}
      </dialog>
    </section>
  );
}
