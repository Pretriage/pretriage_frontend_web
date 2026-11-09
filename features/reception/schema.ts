import { z } from "zod";
import type { ReceptionTriageForm } from "@/lib/api/types";
import { fechaIsoValida } from "@/lib/argentina-date";
import { EDAD_MAXIMA_NACIMIENTO, rangoFechaNacimiento } from "./date-format";

export const dniSchema = z.object({
  dni: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{7,8}$/, "Ingresá un DNI de 7 u 8 dígitos.")),
});

export const patientSchema = z.object({
  dni: z.string().regex(/^\d{7,8}$/, "Ingresá un DNI válido."),
  nombre: z.string().trim().min(1, "Ingresá el nombre."),
  apellido: z.string().trim().min(1, "Ingresá el apellido."),
  fechaNacimiento: z.string()
    .refine(fechaIsoValida, "Seleccioná una fecha de nacimiento válida.")
    .refine((fecha) => {
      const { min, max } = rangoFechaNacimiento();
      return fecha >= min && fecha <= max;
    }, `La fecha debe ser anterior a hoy y corresponder a una edad de hasta ${EDAD_MAXIMA_NACIMIENTO} años.`),
  generoBiologico: z.string().pipe(z.enum(["MASCULINO", "FEMENINO"], "Seleccioná el género biológico.")),
  telefono: z
    .string()
    .trim()
    .regex(/^[+0-9 ()-]{6,25}$/, "Ingresá un teléfono válido."),
  correoElectronico: z
    .string()
    .email("Ingresá un correo válido.")
    .or(z.literal("")),
  calle: z.string().trim().min(1, "Ingresá la calle."),
  alturaDomicilio: z.string().trim().min(1, "Ingresá la altura."),
  piso: z.string(),
  ciudad: z.string().trim().min(1, "Ingresá la localidad o el barrio."),
  provincia: z.string().trim().min(1, "Ingresá la provincia."),
  codigoPostal: z.string().trim(),
  codigoEspecialidad: z.string().min(1, "Seleccioná una especialidad."),
});

export type PatientFormValues = z.input<typeof patientSchema>;
export type PatientAdmissionValues = z.output<typeof patientSchema>;

const clinicalFields = z.object({
  motivoConsulta: z.string(),
  sintomas: z.string(),
  inicio: z.string(),
  evolucion: z.string(),
  antecedentesRelevantes: z.string(),
  medicamentos: z.string(),
  alergias: z.string(),
  posibilidadEmbarazo: z.string(),
  observaciones: z.string(),
});

export const clinicalSchema = clinicalFields.extend({
  motivoConsulta: z.string().trim().min(3, "Describí el motivo principal."),
  inicio: z.string().trim().min(1, "Indicá cuándo comenzó."),
  evolucion: z.string().trim().min(1, "Indicá cómo evolucionó."),
});

const clinicalDraftSchema = clinicalFields.partial().extend({
  fiebre: z.boolean().optional(),
  signosAlarma: z.string().optional(),
  dolores: z.array(z.object({ localizacion: z.string(), intensidad: z.string() })).optional(),
});

export type ClinicalFormValues = z.infer<typeof clinicalSchema>;

export const emptyClinicalForm: ClinicalFormValues = {
  motivoConsulta: "",
  sintomas: "",
  inicio: "",
  evolucion: "",
  antecedentesRelevantes: "",
  medicamentos: "",
  alergias: "",
  posibilidadEmbarazo: "",
  observaciones: "",
};

function list(value: string, separator = /[,\n]+/) {
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function restoreClinicalDraft(value: unknown): ClinicalFormValues {
  const parsed = clinicalDraftSchema.safeParse(value);
  if (!parsed.success) return emptyClinicalForm;

  const { fiebre, signosAlarma = "", dolores = [], sintomas = "", ...fields } = parsed.data;
  // Keep previously entered observations visible when reopening a legacy draft.
  const legacySymptoms = list(signosAlarma);
  if (fiebre) legacySymptoms.push("Fiebre");
  for (const dolor of dolores) {
    const lugar = dolor.localizacion.trim();
    const intensidad = /^(?:[0-9]|10)$/.test(dolor.intensidad) ? ` (intensidad ${dolor.intensidad}/10)` : "";
    if (lugar || intensidad) legacySymptoms.push(`Dolor${lugar ? ` en ${lugar}` : ""}${intensidad}`);
  }
  const reported = new Set(list(sintomas).map((item) => item.toLocaleLowerCase("es-AR")));
  const migrated = legacySymptoms.filter((item) => {
    const key = item.toLocaleLowerCase("es-AR");
    if (reported.has(key)) return false;
    reported.add(key);
    return true;
  });

  return {
    ...emptyClinicalForm,
    ...fields,
    sintomas: migrated.length ? [sintomas.trim(), ...migrated].filter(Boolean).join("\n") : sintomas,
  };
}

export function toTriageRequest(
  values: ClinicalFormValues,
): ReceptionTriageForm {
  return {
    motivoConsulta: values.motivoConsulta.trim(),
    sintomas: list(values.sintomas, /\r?\n/),
    inicio: values.inicio.trim(),
    evolucion: values.evolucion.trim(),
    dolores: [],
    antecedentesRelevantes: list(values.antecedentesRelevantes),
    medicamentos: list(values.medicamentos),
    alergias: list(values.alergias),
    posibilidadEmbarazo: values.posibilidadEmbarazo.trim(),
    observaciones: values.observaciones.trim(),
  };
}
