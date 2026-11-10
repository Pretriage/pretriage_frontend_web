"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { formatoFechaHoraArgentina } from "@/lib/argentina-date";
import styles from "./hospital-configuration-panel.module.css";
import type { ConfigurationOperation, HospitalConfiguration, MedicalSession, Room, Sector, Specialty } from "./hospital-configuration";

type Configure = (operation: ConfigurationOperation, onSuccess?: () => void, onError?: (error: Error) => void) => void;
type Confirmation = {
  operation: ConfigurationOperation;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  destructive?: boolean;
};

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
      <div><strong>{session.medicoNombre}</strong><span>{session.salaNombre ?? "Sin sala"} · {session.estado} · Inicio {formatoFechaHoraArgentina(session.fechaHoraInicio)}</span></div>
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
  onChange?: () => void;
};

function ConfigurationField({ name, label, placeholder, initialValue = "", options, disabled, inputRef, onChange }: ConfigurationFieldProps) {
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
        onChange={(next) => { setValue(next); onChange?.(); }}
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
      }))}
    />
  );
}

function specialtyFrom(data: FormData, specialties: Specialty[], input: HTMLInputElement | null, allowedDisabledId?: number) {
  const specialty = specialties.find((item) =>
    item.id === Number(data.get("specialtyId")) && (item.habilitada || item.id === allowedDisabledId));
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
      <NameField name="roomName" label={room ? "Nombre de la sala" : "Nueva sala"} value={room?.nombre} disabled={pending || !specialtyEnabled} />
      {room && room.especialidadId !== sector.especialidadId ? <p className="notice notice-warning">Esta sala figura con {room.especialidadNombre}. Al guardar, se actualizará a la especialidad del sector.</p> : null}
      <div className="record-actions">
        {room ? <span className="status-chip">{room.activa ? "Activa" : "Inactiva"}</span> : null}
        <button className={room ? "button button-secondary" : "button button-primary"} type="submit" disabled={pending || !specialtyEnabled}>{room ? "Guardar sala" : "Crear sala"}</button>
        {room ? <button className={room.activa ? "button button-danger-ghost" : "button button-secondary"} type="button" disabled={pending || (!room.activa && !specialtyEnabled)} onClick={() => configure({ operation: "setRoomActive", sectorId: sector.id, roomId: room.id, active: !room.activa })}>{room.activa ? "Desactivar sala" : "Activar sala"}</button> : null}
      </div>
    </form>
  );
}

function SectorEditor({ hospitalId, sector, rooms, specialties, pending, configure, requestDelete, loadSectorSessions, closeMedicalSession, refreshAfterSessionClose }: { hospitalId: number; sector: Sector; rooms: Room[]; specialties: Specialty[]; pending: boolean; configure: Configure; requestDelete: () => void; loadSectorSessions: SectorSessionsProps["load"]; closeMedicalSession: SectorSessionsProps["close"]; refreshAfterSessionClose: SectorSessionsProps["refreshAfterClose"] }) {
  const specialtyEnabled = specialties.some((item) => item.id === sector.especialidadId && item.habilitada);
  const specialtyInput = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const nombre = nameFrom(form, "sectorName");
    if (!nombre) return;
    const data = new FormData(form);
    const activa = data.get("active") === "true";
    const specialty = specialtyFrom(data, specialties, specialtyInput.current, activa ? undefined : sector.especialidadId);
    if (!specialty) return;
    configure({ operation: "updateSector", sectorId: sector.id, sector: {
      nombre, especialidadId: specialty.id, activa,
    } });
  }

  return (
    <section className={styles.sectorEditor} aria-label={`Gestionar ${sector.nombre}`}>
      <form className="form-panel" onSubmit={submit} aria-label={`Editar sector ${sector.nombre}`} key={`${sector.nombre}:${sector.especialidadId}:${sector.activa}`}>
        <h4>Editar sector</h4>
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
            onChange={() => specialtyInput.current?.setCustomValidity("")}
          />
        </div>
        <p className="notice notice-info">Al desactivar un sector, sus salas también se desactivan. Si volvés a activarlo, podés activar cada sala desde acá.</p>
        <div className="record-actions">
          <button className="button button-secondary" type="submit" disabled={pending}>Guardar sector</button>
          <button className="button button-danger-ghost" type="button" disabled={pending} onClick={requestDelete}>Eliminar sector</button>
        </div>
      </form>
      <h4>Gestionar salas</h4>
      {!specialtyEnabled ? <p className="notice notice-warning">Habilitá {sector.especialidadNombre} para crear, guardar o activar salas.</p> : null}
      {rooms.map((room) => <RoomForm key={`${room.id}:${room.nombre}:${room.especialidadId}:${room.activa}`} room={room} sector={sector} pending={pending} specialtyEnabled={specialtyEnabled} configure={configure} />)}
      <RoomForm sector={sector} pending={pending} specialtyEnabled={specialtyEnabled} configure={configure} />
      <SectorSessions hospitalId={hospitalId} sector={sector} load={loadSectorSessions} close={closeMedicalSession} refreshAfterClose={refreshAfterSessionClose} />
    </section>
  );
}

function InventoryRooms({ rooms, occupied }: { rooms: Room[]; occupied: Set<number> }) {
  if (rooms.length === 0) return <span className={styles.muted}>Sin salas</span>;
  return (
    <ul className={styles.roomList}>
      {rooms.map((room) => (
        <li key={room.id}>
          <span>{room.nombre}</span>
          {occupied.has(room.id)
            ? <span className={styles.roomOccupied}>Ocupada{room.activa ? "" : " · Inactiva"}</span>
            : <span className={styles.muted}>{room.activa ? "Activa" : "Inactiva"}</span>}
        </li>
      ))}
    </ul>
  );
}

export function HospitalConfigurationPanel({ hospitalId, configuration, pending, error, configure, loadSectorSessions, closeMedicalSession, refreshAfterSessionClose }: { hospitalId: number; configuration?: HospitalConfiguration; pending: boolean; error: Error | null; configure: Configure; loadSectorSessions: SectorSessionsProps["load"]; closeMedicalSession: SectorSessionsProps["close"]; refreshAfterSessionClose: SectorSessionsProps["refreshAfterClose"] }) {
  const specialties = configuration?.especialidades ?? [];
  const sectors = configuration?.sectores ?? [];
  const rooms = configuration?.salas ?? [];
  const hasEnabledSpecialty = specialties.some((item) => item.habilitada);
  const unavailable = !configuration || !Array.isArray(configuration.sectores);
  const disabled = pending || unavailable;
  const occupied = new Set(configuration?.salasOcupadasIds);
  const occupiedCount = rooms.filter((room) => occupied.has(room.id)).length;
  const sectorIds = new Set(sectors.map((sector) => sector.id));
  const unassignedRooms = rooms.filter((room) => room.sectorId === null || !sectorIds.has(room.sectorId));
  const [expandedSectorId, setExpandedSectorId] = useState<number | null>(null);
  const expandedSector = sectors.find((sector) => sector.id === expandedSectorId);
  const expandedRooms = expandedSector ? rooms.filter((room) => room.sectorId === expandedSector.id) : [];
  const sectorEditorRef = useRef<HTMLDivElement>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [confirmationError, setConfirmationError] = useState<Error | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createSpecialtyVersion, setCreateSpecialtyVersion] = useState(0);
  const createFormRef = useRef<HTMLFormElement>(null);
  const createSpecialtyInput = useRef<HTMLInputElement>(null);
  const confirmationBusyRef = useRef(false);

  useEffect(() => {
    if (expandedSectorId !== null) {
      sectorEditorRef.current?.focus();
    }
  }, [expandedSectorId]);

  function requestConfirmation(next: Confirmation) {
    if (disabled || confirmationBusyRef.current) return;
    setConfirmationError(null);
    setSuccessMessage(null);
    setConfirmation(next);
  }

  function confirmOperation() {
    if (!confirmation || disabled || confirmationBusyRef.current) return;
    confirmationBusyRef.current = true;
    setConfirmationBusy(true);
    setConfirmationError(null);
    configure(confirmation.operation, () => {
      if (confirmation.operation.operation === "createSector") {
        createFormRef.current?.reset();
        setCreateSpecialtyVersion((version) => version + 1);
      }
      if (confirmation.operation.operation === "deleteSector") setExpandedSectorId(null);
      setSuccessMessage(confirmation.successMessage);
      setConfirmation(null);
      setConfirmationBusy(false);
      confirmationBusyRef.current = false;
    }, (requestError) => {
      setConfirmationError(requestError);
      setConfirmationBusy(false);
      confirmationBusyRef.current = false;
    });
  }

  function createSector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const form = event.currentTarget;
    const nombre = nameFrom(form, "sectorName");
    if (!nombre) return;
    const specialty = specialtyFrom(new FormData(form), specialties, createSpecialtyInput.current);
    if (!specialty) return;
    requestConfirmation({
      operation: { operation: "createSector", sector: { nombre, especialidadId: specialty.id } },
      title: "Crear sector",
      description: `Se creará «${nombre}» para ${specialty.nombre}. Después podrás agregar sus salas.`,
      confirmLabel: "Confirmar creación",
      successMessage: "Sector creado.",
    });
  }

  function changeSpecialty(specialty: Specialty) {
    const disabling = specialty.habilitada;
    requestConfirmation({
      operation: { operation: disabling ? "disableSpecialty" : "enableSpecialty", specialtyId: specialty.id },
      title: disabling ? "Deshabilitar especialidad" : "Habilitar especialidad",
      description: disabling
        ? `Para dejar de ofrecer ${specialty.nombre} en el hospital, primero desactivá todas sus salas.`
        : `${specialty.nombre} quedará disponible para asignarla a sectores y personal médico.`,
      confirmLabel: disabling ? "Deshabilitar" : "Habilitar",
      successMessage: disabling ? "Especialidad deshabilitada." : "Especialidad habilitada.",
      destructive: disabling,
    });
  }

  function deleteSector(sector: Sector, roomCount: number) {
    const roomNote = roomCount === 1 ? " y su sala" : roomCount > 1 ? ` y sus ${roomCount} salas` : "";
    requestConfirmation({
      operation: { operation: "deleteSector", sectorId: sector.id },
      title: "Eliminar sector",
      description: `Se retirará «${sector.nombre}»${roomNote} de la configuración. Si tiene historial asociado, se conservará archivado.`,
      confirmLabel: "Confirmar eliminación",
      successMessage: "Sector retirado de la configuración.",
      destructive: true,
    });
  }

  return (
    <section className="panel admin-configuration" aria-labelledby="hospital-configuration-heading" aria-busy={pending}>
      <div className={`panel-heading ${styles.panelHeading}`}>
        <div>
          <h2 tabIndex={-1} id="hospital-configuration-heading">Organización del hospital</h2>
          <p>Consultá la ocupación y administrá los recursos de atención.</p>
        </div>
      </div>
      {error && !confirmation ? <p className="notice notice-error" role="alert">{error.message}</p> : null}
      {pending ? <p role="status">{configuration ? "Guardando cambios y actualizando la configuración…" : "Cargando sectores y salas…"}</p> : null}
      {successMessage ? <p className="notice notice-success" role="status">{successMessage}</p> : null}
      {configuration && unavailable ? <p className="notice notice-error" role="alert">No se recibió la información de sectores.</p> : null}
      {!unavailable ? <>
        <dl className={styles.roomTotals} aria-label="Resumen de salas">
          <div><dt>Salas totales</dt><dd>{rooms.length}</dd></div>
          <div><dt>Salas activas</dt><dd>{rooms.filter((room) => room.activa).length}</dd></div>
          <div><dt>Salas ocupadas</dt><dd>{configuration?.salasOcupadasIds ? occupiedCount : "—"}</dd></div>
        </dl>
        <p className={styles.hint}>Las sesiones activas y pausadas ocupan sala. La ocupación se actualiza cada 30 segundos.</p>
        {hasEnabledSpecialty ? (
          <details className={styles.createSector}>
            <summary>Agregar sector</summary>
            <form className="form-panel" ref={createFormRef} onSubmit={createSector} aria-label="Agregar sector">
              <RequiredFieldsNote />
              <div className="form-grid">
                <NameField name="sectorName" label="Nombre del sector" disabled={disabled} />
                <SpecialtyField key={createSpecialtyVersion} specialties={specialties} disabled={disabled} inputRef={createSpecialtyInput} />
              </div>
              <button className="button button-primary" type="submit" disabled={disabled}>Crear sector</button>
            </form>
          </details>
        ) : <p className="notice notice-info">Habilitá una especialidad para crear el primer sector.</p>}
        {specialties.length === 0 ? <p className="notice notice-info">Todavía no hay especialidades disponibles.</p> : (
          <section className={styles.inventorySection} aria-labelledby="specialties-heading">
          <h3 id="specialties-heading">Especialidades</h3>
          <div className={styles.tableFrame}>
            <table className={styles.inventory} aria-label="Especialidades">
              <colgroup><col /><col className={styles.actionColumn} /></colgroup>
              <thead><tr><th scope="col">Especialidad</th><th scope="col">Acciones</th></tr></thead>
              <tbody>{specialties.map((specialty) => <tr className={styles.sectorRow} key={specialty.id}>
                <th scope="row"><strong>{specialty.nombre}</strong><span className={styles.muted}>{specialty.habilitada ? "Habilitada" : "Deshabilitada"}</span></th>
                <td><button className="button button-secondary" type="button" disabled={disabled} aria-label={`${specialty.habilitada ? "Deshabilitar" : "Habilitar"} ${specialty.nombre}`} onClick={() => changeSpecialty(specialty)}>{specialty.habilitada ? "Deshabilitar" : "Habilitar"}</button></td>
              </tr>)}</tbody>
            </table>
          </div>
          </section>
        )}
        <section className={styles.inventorySection} aria-labelledby="sectors-heading">
          <h3 id="sectors-heading">Sectores y salas</h3>
          <div className={`${styles.tableFrame} ${styles.sectorTableFrame}`} role="region" aria-labelledby="sectors-heading" tabIndex={0}>
            <table className={`${styles.inventory} ${styles.sectorInventory}`} aria-label="Sectores y salas">
              <colgroup><col className={styles.sectorColumn} /><col className={styles.specialtyColumn} /><col /><col className={styles.actionColumn} /></colgroup>
              <thead><tr><th scope="col">Sector</th><th scope="col">Especialidad</th><th scope="col">Salas</th><th scope="col">Acciones</th></tr></thead>
              <tbody>
                {sectors.map((sector) => {
                  const sectorRooms = rooms.filter((room) => room.sectorId === sector.id);
                  const expanded = expandedSectorId === sector.id;
                  const specialtyName = sector.especialidadNombre || specialties.find((item) => item.id === sector.especialidadId)?.nombre || "Especialidad no disponible";
                  return <tr key={sector.id} className={styles.sectorRow}>
                    <th scope="row"><strong>{sector.nombre}</strong><span className={styles.muted}>{sector.activa ? "Activo" : "Inactivo"}</span></th>
                    <td>{specialtyName}</td>
                    <td><InventoryRooms rooms={sectorRooms} occupied={occupied} /></td>
                    <td><button className="button button-secondary" type="button" disabled={disabled} aria-expanded={expanded} aria-controls={expanded ? "sector-inventory-editor" : undefined} aria-label={`${expanded ? "Cerrar edición de" : "Gestionar sector"} ${sector.nombre}`} onClick={() => { setSuccessMessage(null); setExpandedSectorId(expanded ? null : sector.id); }}>{expanded ? "Cerrar" : "Gestionar"}</button></td>
                  </tr>;
                })}
                {unassignedRooms.length ? <tr className={styles.sectorRow}>
                  <th scope="row"><strong>Sin sector asignado</strong><span className={styles.muted}>Requiere asignación</span></th>
                  <td><span className={styles.muted}>No corresponde</span></td>
                  <td><InventoryRooms rooms={unassignedRooms} occupied={occupied} /></td><td />
                </tr> : null}
                {!sectors.length && !unassignedRooms.length ? <tr><td colSpan={4} className={styles.muted}>Todavía no hay sectores ni salas sin asignar.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {expandedSector ? (
            <div id="sector-inventory-editor" ref={sectorEditorRef} tabIndex={-1} className={styles.inventoryEditor}>
              <SectorEditor hospitalId={hospitalId} sector={expandedSector} rooms={expandedRooms} specialties={specialties} pending={disabled} configure={configure} requestDelete={() => deleteSector(expandedSector, expandedRooms.length)} loadSectorSessions={loadSectorSessions} closeMedicalSession={closeMedicalSession} refreshAfterSessionClose={refreshAfterSessionClose} />
            </div>
          ) : null}
        </section>
      </> : null}
      <ConfirmationDialog
        open={confirmation !== null}
        title={confirmation?.title ?? ""}
        description={confirmation?.description ?? ""}
        confirmLabel={confirmation?.confirmLabel ?? "Confirmar"}
        confirmTone={confirmation?.destructive ? "danger" : "primary"}
        pendingLabel="Guardando cambios y actualizando la configuración…"
        pending={confirmationBusy || pending}
        error={confirmationError}
        focusFallbackId="hospital-configuration-heading"
        onConfirm={confirmOperation}
        onCancel={() => {
          if (confirmationBusyRef.current) return;
          setConfirmation(null);
          setConfirmationError(null);
        }}
      />
    </section>
  );
}
