"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useRef, useState } from "react";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import {
  isNewPasswordValid,
  passwordRules,
} from "@/features/auth/password-policy";

const GENERIC_ERROR =
  "No pudimos completar la operación. Intentá nuevamente.";

function responseMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  return GENERIC_ERROR;
}

export function PasswordChangeForm() {
  const queryClient = useQueryClient();
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = passwordRules(currentPassword, newPassword);
  const confirmationMismatch =
    confirmation.length > 0 && confirmation !== newPassword;
  const canSubmit =
    !pending &&
    !blocked &&
    currentPassword.length > 0 &&
    isNewPasswordValid(currentPassword, newPassword) &&
    confirmation.length > 0 &&
    confirmation === newPassword;

  function clearError() {
    if (!blocked) setError(null);
  }

  function clearLocalState() {
    queryClient.clear();
    try {
      sessionStorage.clear();
    } catch {
      // sessionStorage puede no estar disponible; igual redirigimos.
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setError(null);

    const response = await fetch("/api/staff/account/password", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contraseniaActual: currentPassword,
        contraseniaNueva: newPassword,
      }),
    }).catch(() => null);

    if (!response) {
      setError(GENERIC_ERROR);
      setPending(false);
      return;
    }

    if (response.ok) {
      clearLocalState();
      window.location.replace("/login?cambio=exito");
      return;
    }

    const message = responseMessage(await response.json().catch(() => null));

    if (response.status === 401) {
      clearLocalState();
      window.location.replace("/login");
      return;
    }

    if (response.status === 423) {
      setBlocked(true);
      setError(message);
      setPending(false);
      return;
    }

    setError(message);
    setPending(false);
    if (response.status === 400) {
      setCurrentPassword("");
      currentPasswordRef.current?.focus();
    }
  }

  return (
    <form className="login-form password-change-form" onSubmit={submit}>
      <RequiredFieldsNote />
      <label className="field">
        <RequiredLabel>Contraseña actual</RequiredLabel>
        <input
          autoComplete="current-password"
          disabled={pending || blocked}
          maxLength={256}
          name="currentPassword"
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            clearError();
          }}
          ref={currentPasswordRef}
          required
          spellCheck={false}
          type="password"
          value={currentPassword}
        />
      </label>

      <div className="field password-change-field">
        <label htmlFor="password-new"><RequiredLabel>Contraseña nueva</RequiredLabel></label>
        <input
          aria-describedby="password-change-rules"
          autoComplete="new-password"
          disabled={pending || blocked}
          id="password-new"
          name="newPassword"
          onChange={(event) => {
            setNewPassword(event.target.value);
            clearError();
          }}
          required
          spellCheck={false}
          type="password"
          value={newPassword}
        />
        <ul
          aria-label="Requisitos de la contraseña nueva"
          aria-live="polite"
          className="password-rules"
          id="password-change-rules"
        >
          {rules.map((rule) => (
            <li
              aria-label={`${rule.label}: ${rule.valid ? "cumple" : "no cumple"}`}
              className={
                rule.valid
                  ? "password-rule password-rule-valid"
                  : "password-rule"
              }
              key={rule.id}
            >
              <span aria-hidden="true" className="password-rule-icon">
                {rule.valid ? "✓" : "○"}
              </span>
              {rule.label}
            </li>
          ))}
        </ul>
      </div>

      <label className="field">
        <RequiredLabel>Repetí la contraseña nueva</RequiredLabel>
        <input
          autoComplete="new-password"
          disabled={pending || blocked}
          name="newPasswordConfirmation"
          onChange={(event) => {
            setConfirmation(event.target.value);
            clearError();
          }}
          required
          spellCheck={false}
          type="password"
          value={confirmation}
        />
        {confirmationMismatch ? (
          <small className="field-error" role="alert">
            Las contraseñas no coinciden.
          </small>
        ) : null}
      </label>

      <div className="notice notice-warning" role="note">
        Después de 3 intentos fallidos consecutivos, el cambio de contraseña se
        bloquea durante 24 horas.
      </div>

      {error ? (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      ) : null}

      <button
        className="button button-primary button-wide"
        disabled={!canSubmit}
        type="submit"
      >
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </button>

      <button 
        className="button button-secondary" 
        type="button" 
        onClick={() => window.location.replace("../")}
      >
        Volver
      </button>
    </form>
  );
}
