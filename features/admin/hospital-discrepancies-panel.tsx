"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { apiClient } from "@/lib/api/client";
import type { ApiSchemas } from "@/lib/api/types";
import { formatoFechaHoraArgentina } from "@/lib/argentina-date";

type HospitalDiscrepancy = Required<ApiSchemas["DiscrepanciaAdminDTO"]>;

const adminApi = "/api/staff/admin";
const headingId = "admin-declaraciones-reportadas";

function sanctionLabel(sanction: HospitalDiscrepancy["sancion"]) {
  if (!sanction.vigente) return "Sin sanción vigente";
  if (sanction.permanente) return "Sanción permanente";
  return sanction.fechaFin ? `Sanción hasta el ${formatoFechaHoraArgentina(sanction.fechaFin)}` : "Sanción vigente";
}

export function HospitalDiscrepanciesPanel({ hospitalId }: { hospitalId: number }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [annulled, setAnnulled] = useState(false);
  const queryKey = ["hospital-admin-discrepancies", hospitalId];
  const discrepancies = useQuery({
    queryKey,
    queryFn: () => apiClient<HospitalDiscrepancy[]>(adminApi, "discrepancies", { hospitalId }),
    gcTime: 0,
  });
  const annul = useMutation({
    mutationFn: (discrepancyId: number) =>
      apiClient<void>(adminApi, "annulDiscrepancy", { hospitalId, discrepancyId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setSelectedId(null);
      setAnnulled(true);
    },
    onError: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="panel-heading">
        <div>
          <h2 id={headingId} tabIndex={-1}>Reportes y penalizaciones</h2>
        </div>
      </div>
      {discrepancies.isPending ? <p className="loading-card" role="status">Cargando reportes…</p> : null}
      {discrepancies.error ? (
        <>
          <p className="notice notice-error" role="alert">{discrepancies.error.message}</p>
          <button className="button button-secondary" type="button" disabled={discrepancies.isFetching} onClick={() => discrepancies.refetch()}>Reintentar</button>
        </>
      ) : null}
      {annulled ? <p className="notice notice-success" role="status">Reporte anulado. La penalización fue recalculada.</p> : null}
      {discrepancies.data?.length === 0 ? <p className="notice notice-info">Este hospital todavía no tiene reportes de síntomas.</p> : null}
      {discrepancies.data?.length ? (
        <ul className="record-list hospital-discrepancy-list">
          {discrepancies.data.map((item) => (
            <li className="record-row" key={item.id}>
              <div>
                <strong>{item.pacienteNombre}</strong>
                <span>DNI {item.pacienteDni}</span>
                <span>{item.medicoNombre} · {formatoFechaHoraArgentina(item.registradaEn)}</span>
                <span>{sanctionLabel(item.sancion)}</span>
              </div>
              <div>
                <span className="status-chip">{item.estado === "VIGENTE" ? "Vigente" : "Anulada"}</span>
                {item.estado === "VIGENTE" ? (
                  <button className="button button-danger-ghost" type="button" disabled={annul.isPending || discrepancies.isError} onClick={() => {
                    annul.reset();
                    setAnnulled(false);
                    setSelectedId(item.id);
                  }}>
                    Anular reporte
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmationDialog
        open={selectedId !== null}
        title="Anular reporte"
        description="¿Estás seguro? Al anular este reporte de síntomas se recalculará la penalización del paciente, que podría quedar habilitado nuevamente para usar la app."
        confirmLabel="Sí, anular"
        pendingLabel="Anulando el reporte y recalculando la penalización…"
        pending={annul.isPending}
        error={annul.error}
        focusFallbackId={headingId}
        onConfirm={() => {
          if (!annul.isPending && selectedId !== null) annul.mutate(selectedId);
        }}
        onCancel={() => {
          setSelectedId(null);
          annul.reset();
        }}
      />
    </section>
  );
}
