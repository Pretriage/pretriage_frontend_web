import { z } from "zod";
import type { ReceptionTriageForm } from "@/lib/api/types";

// La fecha de nacimiento se edita con un <input type="date" /> nativo,
// por lo que el formulario trabaja siempre en formato ISO (AAAA-MM-DD),
// que es el mismo formato que espera el backend.
export function obtenerHoyIso() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function esFechaNacimientoValida(valor: string) {
  const coincidencia = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!coincidencia) return false;
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  const candidata = new Date(anio, mes - 1, dia);
  const esReal = candidata.getFullYear() === anio
    && candidata.getMonth() === mes - 1
    && candidata.getDate() === dia;
  if (!esReal) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return candidata < hoy;
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
  fechaNacimiento: z.string().refine(
    esFechaNacimientoValida,
    "Elegí una fecha válida anterior a hoy.",
  ),
  generoBiologico: z.enum(["MASCULINO", "FEMENINO", "X"]),
  telefono: z
    .string()
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
  codigoEspecialidad: z.string().min(1, "Seleccioná una especialidad."),
});

export type PatientFormValues = z.infer<typeof patientSchema>;

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
