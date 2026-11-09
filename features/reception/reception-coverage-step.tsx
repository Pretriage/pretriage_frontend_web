"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import { apiClient } from "@/lib/api/client";
import type {
  CreatePatientCredential,
  PatientCredential,
} from "@/lib/api/types";

const receptionApi = "/api/staff/reception";
const healthProviders = ["OSDE", "Swiss Medical", "Galeno", "Medifé", "IOMA"];
const healthPlans = ["210", "220", "310", "410", "Plan Único"];

const credentialSchema = z.object({
  nombreObraSocial: z
    .string()
    .trim()
    .min(1, "Ingresá la obra social o prepaga.")
    .regex(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/, "Usá solo letras y espacios."),
  numeroAfiliado: z
    .string()
    .min(6, "Debe tener al menos 6 dígitos.")
    .max(20, "Puede tener hasta 20 dígitos.")
    .regex(/^\d+$/, "Usá solo números."),
  plan: z
    .string()
    .trim()
    .min(1, "Ingresá el plan.")
    .regex(/^[A-Za-z0-9 ]+$/, "Usá solo letras, números y espacios."),
  fechaVencimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresá la fecha de vencimiento."),
});

type CredentialForm = z.infer<typeof credentialSchema>;

const emptyCredential: CredentialForm = {
  nombreObraSocial: "",
  numeroAfiliado: "",
  plan: "",
  fechaVencimiento: "",
};

function formatExpiration(value?: string) {
  if (!value) return "MM/AAAA";
  const [year, month] = value.split("-");
  return month && year ? `${month}/${year}` : value;
}

function CredentialCard({ credential, preview = false }: {
  credential: Partial<PatientCredential & CreatePatientCredential>;
  preview?: boolean;
}) {
  return (
    <article className={`credential-card${preview ? " credential-card-preview" : ""}`}>
      <div className="credential-card-orb" aria-hidden="true" />
      <div className="credential-card-topline">
        <span>{preview ? "Vista previa" : "Credencial médica"}</span>
        <strong>+</strong>
      </div>
      <h2>{credential.nombreObraSocial || "OBRA SOCIAL / PREPAGA"}</h2>
      <div className="credential-number">
        <span>N.º de afiliado</span>
        <strong>{credential.numeroAfiliado || "0000000000"}</strong>
      </div>
      <div className="credential-card-details">
        <div><span>Plan</span><strong>{credential.plan || "—"}</strong></div>
        <div><span>Vencimiento</span><strong>{formatExpiration(credential.fechaVencimiento)}</strong></div>
      </div>
    </article>
  );
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos completar la operación.";
}

export function ReceptionCoverageStep({
  patientId,
  patientName,
  onContinue,
  onCancel,
  isCancelling,
}: {
  patientId: number;
  patientName: string;
  onContinue: () => void;
  onCancel: () => void;
  isCancelling: boolean;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const form = useForm<CredentialForm>({
    resolver: zodResolver(credentialSchema),
    defaultValues: emptyCredential,
  });
  const preview = useWatch({ control: form.control });
  const credentialsQuery = useQuery({
    queryKey: ["reception", "patient-credentials", patientId],
    queryFn: () => apiClient<PatientCredential[]>(receptionApi, "patientCredentials", { patientId }),
  });
  const createCredential = useMutation({
    mutationFn: (credential: CreatePatientCredential) =>
      apiClient<{ mensaje?: string }>(receptionApi, "createPatientCredential", {
        patientId,
        credential,
      }),
    onSuccess: async () => {
      form.reset(emptyCredential);
      setSaved(true);
      await queryClient.invalidateQueries({
        queryKey: ["reception", "patient-credentials", patientId],
      });
    },
  });

  return (
    <div className="coverage-step">
      <header className="page-heading coverage-heading">
        <div>
          <p className="eyebrow">Cobertura médica · {patientName}</p>
          <h1>Credencial de obra social o prepaga</h1>
          <p>Verificá la credencial física y cargá los datos tal como figuran.</p>
        </div>
        <span className="coverage-optional">Paso opcional</span>
      </header>

      {credentialsQuery.isPending ? (
        <div className="loading-card">Buscando credenciales del paciente…</div>
      ) : credentialsQuery.isError ? (
        <div className="notice notice-error" role="alert">{messageFrom(credentialsQuery.error)}</div>
      ) : credentialsQuery.data.length ? (
        <section className="coverage-existing" aria-labelledby="existing-credentials-title">
          <div className="panel-heading">
            <div><h2 id="existing-credentials-title">Credenciales registradas</h2><p>Podés continuar con una existente o agregar otra.</p></div>
            <span className="coverage-count">{credentialsQuery.data.length}</span>
          </div>
          <div className="credential-list">
            {credentialsQuery.data.map((credential, index) => (
              <CredentialCard credential={credential} key={credential.id ?? index} />
            ))}
          </div>
        </section>
      ) : (
        <div className="notice notice-info">El paciente todavía no tiene credenciales registradas.</div>
      )}

      <section className="coverage-layout">
        <div className="credential-preview-wrap">
          <p className="eyebrow">Así se verá</p>
          <CredentialCard credential={preview} preview />
          <p className="credential-preview-help">La vista previa se actualiza mientras completás los datos.</p>
        </div>

        <form
          className="panel form-panel coverage-form"
          onSubmit={form.handleSubmit((values) => {
            setSaved(false);
            createCredential.mutate(values);
          })}
        >
          <div className="panel-heading"><h2>Nueva credencial</h2></div>
          <RequiredFieldsNote />
          <div className="form-grid">
            <label className="field field-wide">
              <RequiredLabel>Obra social o prepaga</RequiredLabel>
              <input aria-required="true" autoComplete="off" list="health-provider-options" placeholder="Ej. OSDE" {...form.register("nombreObraSocial")} />
              <datalist id="health-provider-options">{healthProviders.map((provider) => <option key={provider} value={provider} />)}</datalist>
              {form.formState.errors.nombreObraSocial ? <small className="field-error">{form.formState.errors.nombreObraSocial.message}</small> : null}
            </label>
            <label className="field field-wide">
              <RequiredLabel>N.º de afiliado</RequiredLabel>
              <input aria-required="true" inputMode="numeric" placeholder="Solo números" {...form.register("numeroAfiliado")} />
              {form.formState.errors.numeroAfiliado ? <small className="field-error">{form.formState.errors.numeroAfiliado.message}</small> : null}
            </label>
            <label className="field">
              <RequiredLabel>Plan</RequiredLabel>
              <input aria-required="true" autoComplete="off" list="health-plan-options" placeholder="Ej. 310" {...form.register("plan")} />
              <datalist id="health-plan-options">{healthPlans.map((plan) => <option key={plan} value={plan} />)}</datalist>
              {form.formState.errors.plan ? <small className="field-error">{form.formState.errors.plan.message}</small> : null}
            </label>
            <label className="field">
              <RequiredLabel>Vencimiento</RequiredLabel>
              <input aria-required="true" type="date" {...form.register("fechaVencimiento")} />
              {form.formState.errors.fechaVencimiento ? <small className="field-error">{form.formState.errors.fechaVencimiento.message}</small> : null}
            </label>
          </div>
          {saved ? <div className="notice notice-success" role="status">Credencial guardada correctamente.</div> : null}
          {createCredential.error ? <div className="notice notice-error" role="alert">{messageFrom(createCredential.error)}</div> : null}
          <button className="button button-primary button-wide" disabled={createCredential.isPending} type="submit">
            {createCredential.isPending ? "Guardando…" : "Guardar credencial"}
          </button>
        </form>
      </section>

      <div className="form-actions coverage-actions">
        <button className="button button-danger-ghost" disabled={isCancelling || createCredential.isPending} type="button" onClick={onCancel}>
          {isCancelling ? "Cancelando…" : "Cancelar admisión"}
        </button>
        <button className="button button-primary" disabled={isCancelling || createCredential.isPending} type="button" onClick={onContinue}>Continuar al pretriage</button>
      </div>
    </div>
  );
}
