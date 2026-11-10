export const hospitalAdminSections = [
  { id: "configuracion", label: "Especialidades y salas", description: "Administrá la distribución de los recursos del hospital." },
  { id: "metricas", label: "Métricas", description: "Consultá la actividad asistencial y el pretriage del hospital." },
  { id: "invitar", label: "Invitar personal", description: "Invitá al personal que necesita acceso al hospital." },
  { id: "personal", label: "Gestionar personal", description: "Consultá y administrá las membresías y los roles vigentes." },
  { id: "discrepancias", label: "Anular penalizaciones", description: "Anulá un reporte de síntomas para recalcular la penalización asociada." },
] as const;

export type HospitalAdminSectionId = (typeof hospitalAdminSections)[number]["id"];

export function isHospitalAdminSectionId(value: string): value is HospitalAdminSectionId {
  return hospitalAdminSections.some((section) => section.id === value);
}
