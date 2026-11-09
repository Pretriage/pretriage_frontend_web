"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { withSessionRequest } from "@/lib/session-request";

const intervaloVerificacion = 30_000;
const intervaloReintento = 10_000;

export function GuardiaSesionProtegida() {
  const clienteConsultas = useQueryClient();

  useEffect(() => {
    let cancelado = false;
    let verificando = false;
    let temporizador: number | undefined;

    async function verificarSesion() {
      if (cancelado || verificando) return;
      window.clearTimeout(temporizador);
      verificando = true;

      const respuesta = await withSessionRequest(async () => {
        if (cancelado) return null;
        return fetch("/api/auth/sesion", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
        });
      }).catch(() => null);

      verificando = false;
      if (cancelado) return;
      if (respuesta?.status === 401) {
        cancelado = true;
        clienteConsultas.clear();
        try {
          sessionStorage.clear();
        } catch {
          // Ignorar si el almacenamiento no está disponible.
        }
        window.location.replace("/login");
        return;
      }

      temporizador = window.setTimeout(
        verificarSesion,
        respuesta?.ok ? intervaloVerificacion : intervaloReintento,
      );
    }

    function alMostrarPagina(evento: PageTransitionEvent) {
      if (evento.persisted) void verificarSesion();
    }

    function alCambiarVisibilidad() {
      if (document.visibilityState === "visible") void verificarSesion();
    }

    void verificarSesion();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("focus", verificarSesion);
    window.addEventListener("online", verificarSesion);
    window.addEventListener("pageshow", alMostrarPagina);
    return () => {
      cancelado = true;
      window.clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("focus", verificarSesion);
      window.removeEventListener("online", verificarSesion);
      window.removeEventListener("pageshow", alMostrarPagina);
    };
  }, [clienteConsultas]);

  return null;
}
