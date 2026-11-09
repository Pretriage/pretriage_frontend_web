"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { withSessionRequest } from "@/lib/session-request";

type PropiedadesBotonCierreSesion = {
  clase?: string;
  etiqueta?: string;
  etiquetaEnProceso?: string;
};

// Cierra la sesión sin dejar datos sensibles en el navegador.
// Limpia la caché remota y todo sessionStorage, y reemplaza el historial
// para que la flecha atrás no restaure la pantalla anterior.
export function BotonCierreSesion({
  clase = "logout-link",
  etiqueta = "Salir",
  etiquetaEnProceso = "Saliendo…",
}: PropiedadesBotonCierreSesion) {
  const clienteConsultas = useQueryClient();
  const [enProceso, setEnProceso] = useState(false);

  function limpiarEstadoLocal() {
    clienteConsultas.clear();
    try {
      sessionStorage.clear();
    } catch {
      // sessionStorage puede no estar disponible; igual redirigimos al login.
    }
  }

  async function cerrarSesion() {
    if (enProceso) return;
    setEnProceso(true);
    try {
      await withSessionRequest(() => fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      })).catch(() => null);
    } finally {
      limpiarEstadoLocal();
      // replace rompe el historial: atrás ya no vuelve a la pantalla sensible.
      window.location.replace("/login");
    }
  }

  return (
    <button
      className={clase}
      type="button"
      disabled={enProceso}
      onClick={() => void cerrarSesion()}
    >
      {enProceso ? etiquetaEnProceso : etiqueta}
    </button>
  );
}
