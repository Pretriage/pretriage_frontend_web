"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import { apiClient } from "@/lib/api/client";

type Step = "email" | "token" | "password" | "success";
type TokenRequestResponse = { mensaje: string; tiempoExpiracion: string };
type TokenValidationResponse = { valido: true; message: string };
type PasswordChangeResponse = { message: string };

const apiPath = "/api/auth/password-reset";
const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

function expirationLabel(value: string | null) {
  if (!value) return "unos minutos";
  const [hours, minutes, seconds] = value.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + Math.ceil((seconds || 0) / 60);
  return Number.isFinite(totalMinutes) && totalMinutes > 0
    ? `${totalMinutes} ${totalMinutes === 1 ? "minuto" : "minutos"}`
    : "unos minutos";
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No pudimos completar la operación.";
}

export function PasswordResetFlow() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [expiration, setExpiration] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const requestToken = useMutation({
    mutationFn: (requestedEmail: string) =>
      apiClient<TokenRequestResponse>(apiPath, "requestToken", {
        email: requestedEmail,
      }),
    onSuccess: (response, requestedEmail) => {
      validateToken.reset();
      resetPassword.reset();
      setEmail(requestedEmail);
      setExpiration(response.tiempoExpiracion);
      setToken("");
      setStep("token");
    },
  });

  const validateToken = useMutation({
    mutationFn: (submittedToken: string) =>
      apiClient<TokenValidationResponse>(apiPath, "validateToken", {
        token: submittedToken,
      }),
    onSuccess: (_response, submittedToken) => {
      resetPassword.reset();
      setPasswordError(null);
      setToken(submittedToken);
      setStep("password");
    },
  });

  const resetPassword = useMutation({
    mutationFn: (newPassword: string) =>
      apiClient<PasswordChangeResponse>(apiPath, "resetPassword", {
        token,
        newPassword,
      }),
    onSuccess: () => {
      setToken("");
      setStep("success");
    },
  });

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    requestToken.mutate(String(form.get("email") ?? "").trim().toLowerCase());
  }

  function submitToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    validateToken.mutate(String(form.get("token") ?? "").trim());
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");

    if (!strongPassword.test(password)) {
      setPasswordError("Incluí mayúscula, minúscula, número y símbolo.");
      return;
    }
    if (password !== confirmation) {
      setPasswordError("Las contraseñas no coinciden.");
      return;
    }

    setPasswordError(null);
    resetPassword.mutate(password);
  }

  if (step === "success") {
    return (
      <div className="password-reset-content password-reset-success">
        <div className="success-icon" aria-hidden="true">✓</div>
        <p className="eyebrow">Contraseña actualizada</p>
        <h1>Ya podés volver a ingresar</h1>
        <p className="muted">
          Tu contraseña se cambió correctamente. Usá la nueva contraseña para
          iniciar sesión.
        </p>
        <Link className="button button-primary button-wide" href="/login">
          Ir al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="password-reset-content">
      <p className="eyebrow">Restablecer contraseña</p>
      <h1>
        {step === "email" && "Recuperá el acceso a tu cuenta"}
        {step === "token" && "Ingresá el token que te enviamos"}
        {step === "password" && "Elegí una nueva contraseña"}
      </h1>
      <p className="muted">
        {step === "email" &&
          "Ingresá el correo asociado a tu cuenta de PreTriage."}
        {step === "token" &&
          `Si existe una cuenta para ${email}, vas a recibir un token válido durante ${expirationLabel(expiration)}.`}
        {step === "password" &&
          "Usá al menos 8 caracteres. Te recomendamos combinar distintos tipos de caracteres."}
      </p>

      {step === "email" ? (
        <form className="login-form" onSubmit={submitEmail}>
          <RequiredFieldsNote />
          <label className="field">
            <RequiredLabel>Correo electrónico</RequiredLabel>
            <input
              autoComplete="email"
              defaultValue={email}
              disabled={requestToken.isPending}
              name="email"
              required
              type="email"
            />
          </label>
          {requestToken.error ? (
            <div className="notice notice-error" role="alert">
              {errorMessage(requestToken.error)}
            </div>
          ) : null}
          <button
            className="button button-primary button-wide"
            disabled={requestToken.isPending}
            type="submit"
          >
            {requestToken.isPending ? "Enviando…" : "Enviar token"}
          </button>
        </form>
      ) : null}

      {step === "token" ? (
        <form className="login-form" onSubmit={submitToken}>
          <RequiredFieldsNote />
          <div className="notice notice-info" role="status">
            Revisá tu bandeja de entrada y correo no deseado.
          </div>
          <label className="field">
            <RequiredLabel>Token de verificación</RequiredLabel>
            <input
              autoCapitalize="none"
              autoComplete="one-time-code"
              autoFocus
              disabled={validateToken.isPending || requestToken.isPending}
              maxLength={256}
              name="token"
              required
              spellCheck={false}
            />
          </label>
          {validateToken.error || requestToken.error ? (
            <div className="notice notice-error" role="alert">
              {errorMessage(validateToken.error ?? requestToken.error)}
            </div>
          ) : null}
          <button
            className="button button-primary button-wide"
            disabled={validateToken.isPending || requestToken.isPending}
            type="submit"
          >
            {validateToken.isPending ? "Validando…" : "Continuar"}
          </button>
          <div className="password-reset-actions">
            <button
              className="inline-action"
              disabled={requestToken.isPending}
              onClick={() => requestToken.mutate(email)}
              type="button"
            >
              {requestToken.isPending ? "Reenviando…" : "Reenviar token"}
            </button>
            <button
              className="inline-action"
              disabled={requestToken.isPending}
              onClick={() => setStep("email")}
              type="button"
            >
              Cambiar correo
            </button>
          </div>
        </form>
      ) : null}

      {step === "password" ? (
        <form className="login-form" onSubmit={submitPassword}>
          <RequiredFieldsNote />
          <label className="field">
            <RequiredLabel>Nueva contraseña</RequiredLabel>
            <input
              autoComplete="new-password"
              disabled={resetPassword.isPending}
              maxLength={72}
              minLength={8}
              name="password"
              onChange={() => passwordError && setPasswordError(null)}
              required
              type="password"
            />
            <small className="field-help">
              Entre 8 y 72 caracteres, con mayúscula, minúscula, número y símbolo.
            </small>
          </label>
          <label className="field">
            <RequiredLabel>Confirmá la contraseña</RequiredLabel>
            <input
              autoComplete="new-password"
              disabled={resetPassword.isPending}
              maxLength={72}
              minLength={8}
              name="passwordConfirmation"
              onChange={() => passwordError && setPasswordError(null)}
              required
              type="password"
            />
          </label>
          {passwordError ? (
            <div className="notice notice-error" role="alert">
              {passwordError}
            </div>
          ) : null}
          {resetPassword.error ? (
            <div className="notice notice-error" role="alert">
              {errorMessage(resetPassword.error)}
            </div>
          ) : null}
          <button
            className="button button-primary button-wide"
            disabled={resetPassword.isPending}
            type="submit"
          >
            {resetPassword.isPending ? "Guardando…" : "Cambiar contraseña"}
          </button>
          <button
            className="inline-action inline-action-centered"
            disabled={resetPassword.isPending}
            onClick={() => setStep("token")}
            type="button"
          >
            Ingresar otro token
          </button>
        </form>
      ) : null}

      <Link className="password-reset-login-link" href="/login">
        Volver al inicio de sesión
      </Link>
    </div>
  );
}
