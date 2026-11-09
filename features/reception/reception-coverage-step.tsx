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
import { fechaIsoALocal, fechaLocalAIso, hoyIso } from "./date-format";

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
    .transform(fechaLocalAIso)
    .pipe(z.string("Ingresá una fecha válida en formato dd/mm/aaaa."))
    .refine((fecha) => fecha > hoyIso(), "El vencimiento debe ser posterior a hoy."),
});

type CredentialForm = z.infer<typeof credentialSchema>;

const emptyCredential: CredentialForm = {
  nombreObraSocial: "",
  numeroAfiliado: "",
  plan: "",
  fechaVencimiento: "",
};

function credentialIsCurrent(credential: PatientCredential, today: string) {
  return Boolean(credential.fechaVencimiento && credential.fechaVencimiento > today);
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
        <div><span>Vencimiento</span><strong>{fechaIsoALocal(credential.fechaVencimiento) || "dd/mm/aaaa"}</strong></div>
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
  initialCredentialId,
  onContinue,
  onCancel,
  isCancelling,
  isContinuing = false,
}: {
  patientId: number;
  patientName: string;
  initialCredentialId?: number | null;
  onContinue: (credentialId: number | null) => void;
  onCancel: () => void;
  isCancelling: boolean;
  isContinuing?: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedCredentialId, setSelectedCredentialId] = useState(initialCredentialId ?? null);
  const [editingCredentialId, setEditingCredentialId] = useState<number | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState(false);
  const form = useForm<z.input<typeof credentialSchema>, unknown, CredentialForm>({
    resolver: zodResolver(credentialSchema),
    defaultValues: emptyCredential,
  });
  const preview = useWatch({ control: form.control });
  const credentialsKey = ["reception", "patient-credentials", patientId];
  const credentialsQuery = useQuery({
    queryKey: credentialsKey,
    queryFn: () => apiClient<PatientCredential[]>(receptionApi, "patientCredentials", { patientId }),
  });
  const saveCredential = useMutation({
    mutationFn: ({ credentialId, credential }: { credentialId: number | null; credential: CreatePatientCredential }) =>
      apiClient<{ mensaje?: string }>(receptionApi, credentialId === null ? "createPatientCredential" : "updatePatientCredential", {
        patientId,
        ...(credentialId !== null ? { credentialId } : {}),
        credential,
      }),
    onSuccess: async (_, { credentialId }) => {
      await queryClient.invalidateQueries({ queryKey: credentialsKey });
      setEditingCredentialId(null);
      form.reset(emptyCredential);
      setSavedMessage(credentialId === null ? "Credencial guardada correctamente." : "Credencial actualizada correctamente.");
    },
  });
  const today = hoyIso();
  const pending = isCancelling || isContinuing || saveCredential.isPending;
  const credentials = credentialsQuery.data ?? [];
  const selectedCredential = credentials.find((credential) => credential.id === selectedCredentialId);
  const selectedUnavailable = selectedCredentialId !== null && !credentialsQuery.isPending &&
    (!selectedCredential || !credentialIsCurrent(selectedCredential, today));

  function selectCredential(credentialId: number | null) {
    setSelectedCredentialId(credentialId);
    setSelectionError(false);
  }

  function editCredential(credential: PatientCredential, id: number) {
    setEditingCredentialId(id);
    setSavedMessage(null);
    saveCredential.reset();
    form.reset({
      nombreObraSocial: credential.nombreObraSocial ?? "",
      numeroAfiliado: credential.numeroAfiliado ?? "",
      plan: credential.plan ?? "",
      fechaVencimiento: fechaIsoALocal(credential.fechaVencimiento ?? ""),
    });
    requestAnimationFrame(() => form.setFocus("nombreObraSocial"));
  }

  function cancelEdit() {
    setEditingCredentialId(null);
    saveCredential.reset();
    form.reset(emptyCredential);
  }

  function continueToTriage() {
    if (selectedCredentialId !== null && (!selectedCredential || !credentialIsCurrent(selectedCredential, hoyIso()))) {
      setSelectionError(true);
      return;
    }
    onContinue(selectedCredentialId);
  }

  return (
    <div className="coverage-step">
      <header className="page-heading coverage-heading">
        <div>
          <p className="eyebrow">Cobertura médica · {patientName}</p>
          <h1>Credencial de obra social o prepaga</h1>
          <p>Elegí la cobertura para esta atención o continuá sin cobertura. Verificá los datos con la credencial física.</p>
        </div>
        <span className="coverage-optional">Paso opcional</span>
      </header>

      <section className="coverage-existing" aria-labelledby="existing-credentials-title">
        <div className="panel-heading">
          <div><h2 id="existing-credentials-title">Cobertura de esta atención</h2><p>Podés usar una credencial vigente, actualizarla o cargar otra.</p></div>
          {credentials.length > 0 ? <span className="coverage-count">{credentials.length}</span> : null}
        </div>
        <fieldset className="coverage-options" aria-labelledby="existing-credentials-title" disabled={pending}>
          <label className="check-field">
            <input type="radio" name="coverageCredential" value="none" checked={selectedCredentialId === null} onChange={() => selectCredential(null)} />
            <span>Sin cobertura para esta atención</span>
          </label>
          {credentialsQuery.isPending ? <div className="loading-card">Buscando credenciales del paciente…</div> : null}
          {credentialsQuery.isError ? <div className="notice notice-error" role="alert">{messageFrom(credentialsQuery.error)}</div> : null}
          {!credentials.length && !credentialsQuery.isPending && !credentialsQuery.isError ? (
            <div className="notice notice-info">El paciente todavía no tiene credenciales registradas.</div>
          ) : null}
          {credentials.length > 0 ? <div className="credential-list">
            {credentials.map((credential, index) => {
              const id = credential.id;
              const current = credentialIsCurrent(credential, today);
              const credentialLabel = `${credential.nombreObraSocial ?? "obra social o prepaga"}, afiliado ${credential.numeroAfiliado ?? "sin número"}`;
              return (
                <div className="credential-option" key={id ?? index}>
                  <CredentialCard credential={credential} />
                  {typeof id === "number" ? <div className="credential-option-actions">
                    <label className="check-field">
                      <input
                        type="radio"
                        name="coverageCredential"
                        value={id}
                        checked={selectedCredentialId === id}
                        disabled={!current}
                        onChange={() => selectCredential(id)}
                        aria-label={`Usar esta credencial de ${credentialLabel}`}
                      />
                      <span>Usar esta credencial</span>
                    </label>
                    <button className="button button-secondary" type="button" onClick={() => editCredential(credential, id)} aria-label={`Editar credencial de ${credentialLabel}`}>Editar</button>
                  </div> : null}
                  {!current ? <p className="field-help">Para usarla, cargá un vencimiento posterior a hoy.</p> : null}
                </div>
              );
            })}
          </div> : null}
          {selectedUnavailable || selectionError ? <p className="field-error" role="alert">La credencial seleccionada ya no está disponible. Elegí otra o continuá sin cobertura.</p> : null}
        </fieldset>
      </section>

      <section className="coverage-layout">
        <div className="credential-preview-wrap">
          <p className="eyebrow">Así se verá</p>
          <CredentialCard credential={{ ...preview, fechaVencimiento: fechaLocalAIso(preview.fechaVencimiento ?? "") ?? undefined }} preview />
          <p className="credential-preview-help">La vista previa se actualiza mientras completás los datos.</p>
        </div>

        <form
          className="panel form-panel coverage-form"
          onSubmit={form.handleSubmit((values) => {
            if (pending) return;
            setSavedMessage(null);
            saveCredential.mutate({ credentialId: editingCredentialId, credential: values });
          })}
        >
          <div className="panel-heading"><h2>{editingCredentialId === null ? "Nueva credencial" : "Editar credencial"}</h2></div>
          <RequiredFieldsNote />
          <fieldset className="form-grid coverage-form-fields" disabled={pending}>
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
              <input
                aria-required="true"
                aria-invalid={Boolean(form.formState.errors.fechaVencimiento)}
                aria-describedby={form.formState.errors.fechaVencimiento ? "credential-expiration-error" : undefined}
                type="text"
                maxLength={10}
                placeholder="dd/mm/aaaa"
                {...form.register("fechaVencimiento")}
              />
              {form.formState.errors.fechaVencimiento ? <small className="field-error" id="credential-expiration-error">{form.formState.errors.fechaVencimiento.message}</small> : null}
            </label>
          </fieldset>
          {savedMessage ? <div className="notice notice-success" role="status">{savedMessage}</div> : null}
          {saveCredential.error ? <div className="notice notice-error" role="alert">{messageFrom(saveCredential.error)}</div> : null}
          <div className="form-actions">
            {editingCredentialId !== null ? <button className="button button-secondary" disabled={pending} type="button" onClick={cancelEdit}>Cancelar edición</button> : null}
            <button className="button button-primary button-wide" disabled={pending} type="submit">
              {saveCredential.isPending ? "Guardando…" : editingCredentialId === null ? "Guardar credencial" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </section>

      <div className="form-actions coverage-actions">
        <button className="button button-danger-ghost" disabled={pending} type="button" onClick={onCancel}>
          {isCancelling ? "Cancelando…" : "Cancelar admisión"}
        </button>
        <button className="button button-primary" disabled={pending || editingCredentialId !== null || selectedUnavailable || (selectedCredentialId !== null && credentialsQuery.isPending)} type="button" onClick={continueToTriage}>
          {isContinuing ? "Guardando cobertura…" : "Continuar al pretriage"}
        </button>
      </div>
    </div>
  );
}
