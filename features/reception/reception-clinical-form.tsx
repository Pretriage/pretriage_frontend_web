import { useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type { ClinicalFormValues } from "./schema";
import styles from "./reception-clinical-form.module.css";

export const EVOLUTION_LABELS = {
  empeora: "Empeoró",
  estable: "Se mantiene igual",
  mejora: "Mejoró",
};

const evolutionOptions = Object.entries(EVOLUTION_LABELS).map(([value, label]) => ({ value, label }));
const pregnancyOptions = [
  { value: "", label: "No informado / no aplica" },
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
  { value: "no sabe", label: "No sabe" },
];

export function ReceptionClinicalForm({ form, onReview, onCancel, onEditCoverage, isCancelling }: {
  form: UseFormReturn<ClinicalFormValues>;
  onReview: (values: ClinicalFormValues) => void;
  onCancel: () => void;
  onEditCoverage?: () => void;
  isCancelling: boolean;
}) {
  const { control, register, handleSubmit, formState: { errors } } = form;
  const [additionalOpen, setAdditionalOpen] = useState(() => {
    const { antecedentesRelevantes, medicamentos, alergias, posibilidadEmbarazo, observaciones } = form.getValues();
    return [antecedentesRelevantes, medicamentos, alergias, posibilidadEmbarazo, observaciones].some((value) => value.trim());
  });

  return (
    <form className="form-panel" onSubmit={handleSubmit(onReview)}>
      <section className={`panel form-panel ${styles.primary}`} aria-labelledby="clinical-primary-title">
        <div className={styles.heading}>
          <h2 id="clinical-primary-title">Motivo y evolución</h2>
          <RequiredFieldsNote />
        </div>

        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="clinical-reason"><RequiredLabel>Motivo principal</RequiredLabel></label>
            <textarea
              id="clinical-reason"
              aria-required="true"
              aria-invalid={Boolean(errors.motivoConsulta)}
              aria-describedby={errors.motivoConsulta ? "clinical-reason-help clinical-reason-error" : "clinical-reason-help"}
              rows={3}
              placeholder="Ej. dolor de cabeza leve desde esta mañana"
              {...register("motivoConsulta")}
            />
            <small className="field-help" id="clinical-reason-help">Anotá lo que cuenta el paciente. Si describe dolor, incluí dónde le duele y cómo lo siente.</small>
            {errors.motivoConsulta ? <span className="field-error" id="clinical-reason-error">{errors.motivoConsulta.message}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="clinical-onset"><RequiredLabel>¿Cuándo empezó?</RequiredLabel></label>
            <input
              id="clinical-onset"
              aria-required="true"
              aria-invalid={Boolean(errors.inicio)}
              aria-describedby={errors.inicio ? "clinical-onset-error" : undefined}
              placeholder="Ej. hace 2 horas"
              {...register("inicio")}
            />
            {errors.inicio ? <span className="field-error" id="clinical-onset-error">{errors.inicio.message}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="clinical-evolution"><RequiredLabel>¿Cómo evolucionó?</RequiredLabel></label>
            <Controller control={control} name="evolucion" render={({ field, fieldState }) => (
              <SearchableCombobox
                {...field}
                id="clinical-evolution"
                options={evolutionOptions}
                placeholder="Seleccioná una opción"
                aria-required="true"
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.error ? "clinical-evolution-error" : undefined}
              />
            )} />
            {errors.evolucion ? <span className="field-error" id="clinical-evolution-error">{errors.evolucion.message}</span> : null}
          </div>

          <div className="field field-wide">
            <label htmlFor="clinical-symptoms">Otros síntomas</label>
            <textarea id="clinical-symptoms" aria-describedby="clinical-symptoms-help" rows={2} placeholder="Ej. náuseas, mareos, fiebre" {...register("sintomas")} />
            <small className="field-help" id="clinical-symptoms-help">Agregá lo que no hayas anotado en el motivo principal. Podés usar una línea por observación.</small>
          </div>
        </div>
      </section>

      <details className={`panel ${styles.additional}`} open={additionalOpen} onToggle={(event) => setAdditionalOpen(event.currentTarget.open)}>
        <summary>Información complementaria <span>Completala si corresponde.</span></summary>
        <div className="form-grid">
          <label className="field field-wide"><span>Antecedentes relevantes</span><textarea rows={2} {...register("antecedentesRelevantes")} /></label>
          <label className="field"><span>Medicamentos</span><input {...register("medicamentos")} /></label>
          <label className="field"><span>Alergias</span><input {...register("alergias")} /></label>
          <div className="field">
            <label htmlFor="clinical-pregnancy">Posibilidad de embarazo</label>
            <Controller control={control} name="posibilidadEmbarazo" render={({ field }) => (
              <SearchableCombobox
                {...field}
                id="clinical-pregnancy"
                options={pregnancyOptions}
                placeholder="No informado / no aplica"
              />
            )} />
          </div>
          <label className="field field-wide"><span>Observaciones</span><textarea rows={2} {...register("observaciones")} /></label>
        </div>
      </details>

      <footer className={styles.footer}>
        <p>El borrador se guarda en este dispositivo y se elimina al finalizar o cancelar la admisión.</p>
        <div className={styles.actions}>
          <button className="button button-danger-ghost" disabled={isCancelling} type="button" onClick={onCancel}>Cancelar admisión</button>
          <div className={styles.nextActions}>
            {onEditCoverage ? <button className="button button-secondary" type="button" disabled={isCancelling} onClick={onEditCoverage}>Editar cobertura</button> : null}
            <button className="button button-primary" disabled={isCancelling} type="submit">Revisar información</button>
          </div>
        </div>
      </footer>
    </form>
  );
}
