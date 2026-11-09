"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    }).catch(() => null);

    if (!response?.ok) {
      const payload = response
        ? await response.json().catch(() => null)
        : null;
      setError(
        typeof payload?.message === "string"
          ? payload.message
          : "No pudimos iniciar sesión.",
      );
      setPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <RequiredFieldsNote />
      <label className="field">
        <RequiredLabel>Correo electrónico</RequiredLabel>
        <input
          autoComplete="username"
          disabled={pending}
          name="email"
          required
          type="email"
        />
      </label>
      <label className="field">
        <RequiredLabel>Contraseña</RequiredLabel>
        <input
          autoComplete="current-password"
          disabled={pending}
          name="password"
          required
          type="password"
        />
      </label>
      <Link className="forgot-password-link" href="/restablecer-contrasena">
        ¿Olvidaste tu contraseña?
      </Link>
      {error ? (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      ) : null}
      <button
        className="button button-primary button-wide"
        disabled={pending}
        type="submit"
      >
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
