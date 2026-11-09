"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import { STAFF_NAME_MAX_LENGTH, type StaffProfileName } from "@/features/auth/staff-profile";

type Props = StaffProfileName & { email: string };
const saveError = "No pudimos guardar los datos. Intentá nuevamente.";

async function updateProfile(profile: StaffProfileName): Promise<StaffProfileName> {
  const response = await fetch("/api/staff/account/profile", {
    method: "PUT",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  }).catch(() => null);
  if (!response) throw new Error(saveError);
  if (response.ok) return response.json();

  const payload = await response.json().catch(() => null);
  const message = typeof payload?.message === "string" ? payload.message : saveError;
  throw new Error(message);
}

export function StaffProfileForm({ nombre, apellido, email }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(nombre);
  const [lastName, setLastName] = useState(apellido);
  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: (profile) => {
      setFirstName(profile.nombre);
      setLastName(profile.apellido);
      router.refresh();
    },
  });
  const saved = save.data ?? { nombre, apellido };
  const nextName = firstName.trim();
  const nextLastName = lastName.trim();
  const changed = nextName !== saved.nombre || nextLastName !== saved.apellido;
  const canSave = Boolean(nextName && nextLastName && changed && !save.isPending);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSave) save.mutate({ nombre: nextName, apellido: nextLastName });
  }

  return (
    <form className="form-panel" onSubmit={submit}>
      <RequiredFieldsNote />
      <div className="form-grid">
        <label className="field">
          <RequiredLabel>Nombre</RequiredLabel>
          <input
            autoComplete="given-name"
            disabled={save.isPending}
            maxLength={STAFF_NAME_MAX_LENGTH}
            name="nombre"
            onChange={(event) => setFirstName(event.target.value)}
            required
            value={firstName}
          />
        </label>
        <label className="field">
          <RequiredLabel>Apellido</RequiredLabel>
          <input
            autoComplete="family-name"
            disabled={save.isPending}
            maxLength={STAFF_NAME_MAX_LENGTH}
            name="apellido"
            onChange={(event) => setLastName(event.target.value)}
            required
            value={lastName}
          />
        </label>
      </div>
      <div className="field">
        <label htmlFor="profile-email">Correo electrónico</label>
        <input id="profile-email" aria-describedby="profile-email-hint" readOnly type="email" value={email} />
        <small className="field-help" id="profile-email-hint">Es el correo que usás para iniciar sesión.</small>
      </div>
      {save.isError ? (
        <div className="notice notice-error" role="alert">{save.error.message}</div>
      ) : null}
      {save.isSuccess && !changed ? (
        <div className="notice notice-success" role="status">Datos guardados.</div>
      ) : null}
      <div className="form-actions">
        <button className="button button-primary" disabled={!canSave} type="submit">
          {save.isPending ? "Guardando…" : "Guardar datos"}
        </button>
      </div>
    </form>
  );
}
