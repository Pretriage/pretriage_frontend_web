/**
 * Catálogo compartido de niveles de gravedad (tabla de Manchester) usado por
 * recepción, el médico y la vista de métricas. El formateo es-AR queda en las
 * features; este módulo sólo mapea etiquetas, clases de color y órdenes.
 */

export type NivelGravedad =
  | "RIESGO_VITAL_INMEDIATO"
  | "MUY_URGENTE"
  | "URGENTE"
  | "NORMAL"
  | "NO_URGENTE"
  | "SIN_REVISION"
  | "SIN_CLASIFICACION_IA";

export const NIVEL_GRAVEDAD_LABELS: Record<NivelGravedad, string> = {
  RIESGO_VITAL_INMEDIATO: "Riesgo vital inmediato",
  MUY_URGENTE: "Muy urgente",
  URGENTE: "Urgente",
  NORMAL: "Normal",
  NO_URGENTE: "No urgente",
  SIN_REVISION: "Sin revisión",
  SIN_CLASIFICACION_IA: "Sin clasificación de IA",
};

export const NIVEL_GRAVEDAD_CLASS: Record<NivelGravedad, string> = {
  RIESGO_VITAL_INMEDIATO: "priority-critical",
  MUY_URGENTE: "priority-critical",
  URGENTE: "priority-urgent",
  NORMAL: "priority-normal",
  NO_URGENTE: "priority-low",
  SIN_REVISION: "priority-neutral",
  SIN_CLASIFICACION_IA: "priority-neutral",
};

/** Orden canónico de gravedad para la distribución del bot (5 niveles). */
export const NIVELES_GRAVEDAD_BOT = [
  "RIESGO_VITAL_INMEDIATO",
  "MUY_URGENTE",
  "URGENTE",
  "NORMAL",
  "NO_URGENTE",
] as const satisfies readonly NivelGravedad[];

/**
 * Orden canónico para la revisión del médico. `SIN_REVISION` no es un nivel de
 * gravedad y siempre queda última.
 */
export const NIVELES_GRAVEDAD_MEDICO = [
  ...NIVELES_GRAVEDAD_BOT,
  "SIN_REVISION",
] as const satisfies readonly NivelGravedad[];

/** `true` sólo para niveles propios del catálogo (no claves heredadas del objeto). */
export function esNivelGravedad(value?: string): value is NivelGravedad {
  return typeof value === "string" && Object.hasOwn(NIVEL_GRAVEDAD_LABELS, value);
}

/** Etiqueta del nivel sólo si pertenece al catálogo conocido. */
export function nivelGravedadLabel(value?: string): string | null {
  return esNivelGravedad(value) ? NIVEL_GRAVEDAD_LABELS[value] : null;
}

/** Clase de color del nivel sólo si pertenece al catálogo conocido. */
export function nivelGravedadClass(value?: string): string | null {
  return esNivelGravedad(value) ? NIVEL_GRAVEDAD_CLASS[value] : null;
}
