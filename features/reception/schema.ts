import { z } from "zod";
import type { ReceptionTriageForm } from "@/lib/api/types";
import { fechaLocalAIso, hoyIso } from "./date-format";

const EDAD_MAXIMA = 120;

function fechaNacimientoMinima(hoy: string) {
  const [anio, mes, dia] = hoy.split("-");
  const anioMinimo = Number(anio) - EDAD_MAXIMA;
  const ultimoDiaMes = new Date(Date.UTC(anioMinimo, Number(mes), 0)).getUTCDate();
  return `${anioMinimo}-${mes}-${String(Math.min(Number(dia), ultimoDiaMes)).padStart(2, "0")}`;
}

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
    .transform(fechaLocalAIso)
    .pipe(z.string("Ingresá una fecha válida en formato dd/mm/aaaa."))
    .refine((fecha) => {
      const hoy = hoyIso();
      return fecha >= fechaNacimientoMinima(hoy) && fecha < hoy;
    }, `La fecha debe ser anterior a hoy y corresponder a una edad de hasta ${EDAD_MAXIMA} años.`),
  generoBiologico: z.string().pipe(z.enum(["MASCULINO", "FEMENINO", "X"], "Seleccioná el género biológico.")),
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

export const clinicalSchema = z.object({
  motivoConsulta: z.string().trim().min(3, "Describí el motivo principal."),
  sintomas: z.string(),
  inicio: z.string().trim().min(1, "Indicá cuándo comenzó."),
  evolucion: z.string().trim().min(1, "Indicá cómo evolucionó."),
  dolores: z.array(z.object({
    localizacion: z.string().trim().min(1, "Indicá dónde duele."),
    intensidad: z.string().regex(/^(?:[0-9]|10)$/, "Ingresá un valor entre 0 y 10."),
  })),
  fiebre: z.boolean(),
  signosAlarma: z.string(),
  antecedentesRelevantes: z.string(),
  medicamentos: z.string(),
  alergias: z.string(),
  posibilidadEmbarazo: z.string(),
  observaciones: z.string(),
});

export type ClinicalFormValues = z.infer<typeof clinicalSchema>;

export const emptyClinicalForm: ClinicalFormValues = {
  motivoConsulta: "",
  sintomas: "",
  inicio: "",
  evolucion: "",
  dolores: [],
  fiebre: false,
  signosAlarma: "",
  antecedentesRelevantes: "",
  medicamentos: "",
  alergias: "",
  posibilidadEmbarazo: "",
  observaciones: "",
};

function list(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toTriageRequest(
  values: ClinicalFormValues,
): ReceptionTriageForm {
  return {
    motivoConsulta: values.motivoConsulta.trim(),
    sintomas: list(values.sintomas),
    inicio: values.inicio.trim(),
    evolucion: values.evolucion.trim(),
    dolores: values.dolores.map((dolor) => ({
      localizacion: dolor.localizacion.trim(),
      intensidad: Number(dolor.intensidad),
    })),
    fiebre: values.fiebre,
    signosAlarma: list(values.signosAlarma),
    antecedentesRelevantes: list(values.antecedentesRelevantes),
    medicamentos: list(values.medicamentos),
    alergias: list(values.alergias),
    posibilidadEmbarazo: values.posibilidadEmbarazo.trim(),
    observaciones: values.observaciones.trim(),
  };
}
