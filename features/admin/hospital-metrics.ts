import { z } from "zod";
import type { components } from "@/contracts/pretriage-api";
import {
  esNivelGravedad,
  NIVEL_GRAVEDAD_CLASS,
  NIVEL_GRAVEDAD_LABELS,
  NIVELES_GRAVEDAD_BOT,
  NIVELES_GRAVEDAD_MEDICO,
  type NivelGravedad,
} from "@/lib/severity";

export type DistribucionNivelItem =
  components["schemas"]["DistribucionNivelItem"];
export type MetricasHospitalResponse =
  components["schemas"]["MetricasHospitalResponse"];
export type SerieDiariaItem = components["schemas"]["SerieDiariaItem"];

const formatoEntero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const formatoDecimal = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Conteos y promedios en es-AR; los nulos muestran falta de dato ("-"). */
export function formatoConteo(valor?: number | null) {
  return typeof valor === "number" && Number.isFinite(valor)
    ? formatoEntero.format(valor)
    : "-";
}

export function formatoPromedio(valor?: number | null) {
  return typeof valor === "number" && Number.isFinite(valor)
    ? formatoDecimal.format(valor)
    : "-";
}

/** Porcentaje como parte entera truncada, sin redondeo (70,9 -> "70"). */
export function formatoPorcentajeEntero(valor?: number | null) {
  return typeof valor === "number" && Number.isFinite(valor)
    ? Math.trunc(valor)
    : null;
}

/** Porcentaje de una parte sobre el total; el truncado final lo hace el anillo. */
export function porcentajeDesdeConteos(parte?: number | null, total?: number | null) {
  if (
    typeof parte !== "number" ||
    !Number.isFinite(parte) ||
    typeof total !== "number" ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null;
  }
  return (parte / total) * 100;
}

/** Fecha serial yyyy-MM-dd -> dd/MM/yyyy. */
export function formatoFechaIso(valor?: string | null) {
  if (!fechaIsoValida(valor) || typeof valor !== "string") return "-";
  const [anio, mes, dia] = valor.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Fecha serial yyyy-MM-dd -> dd/MM para las etiquetas de los ejes. */
export function formatoFechaCorta(valor?: string | null) {
  const completa = formatoFechaIso(valor);
  return completa === "-" ? completa : completa.slice(0, 5);
}

/** Valida forma yyyy-MM-dd y fecha de calendario real (rechaza 30-02, etc.). */
export function fechaIsoValida(valor?: string | null): boolean {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number) as [number, number, number];
  const fecha = new Date(anio, mes - 1, dia);
  return (
    fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia
  );
}

/** ISO local con partes de fecha locales; nunca toISOString() (corta por UTC). */
function isoLocal(fecha: Date) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(
    fecha.getDate(),
  ).padStart(2, "0")}`;
}

export function hoyIso() {
  return isoLocal(new Date());
}

export function ayerIso(hoy = hoyIso()) {
  const [anio, mes, dia] = hoy.split("-").map(Number) as [number, number, number];
  const ayer = new Date(anio, mes - 1, dia);
  ayer.setDate(ayer.getDate() - 1);
  return isoLocal(ayer);
}

type ErroresDeRango = { desde?: string; hasta?: string };

const MENSAJES = {
  desdeObligatoria: "La fecha desde es obligatoria.",
  desdeInvalida: "La fecha desde no es válida.",
  desdeNoAnterior: "La fecha desde debe ser anterior a hoy.",
  hastaObligatoria: "La fecha hasta es obligatoria.",
  hastaInvalida: "La fecha hasta no es válida.",
  hastaPosterior: "La fecha hasta debe ser hoy o anterior.",
  rangoInvertido: "La fecha hasta debe ser mayor o igual que la fecha desde.",
} as const;

/** Reglas del rango: desde < hoy (estricto), hasta <= hoy, hasta >= desde. */
export function validarRangoFechas(
  desde: string,
  hasta: string,
  hoy = hoyIso(),
): ErroresDeRango {
  const errores: ErroresDeRango = {};

  if (!desde.trim()) errores.desde = MENSAJES.desdeObligatoria;
  else if (!fechaIsoValida(desde)) errores.desde = MENSAJES.desdeInvalida;
  else if (desde >= hoy) errores.desde = MENSAJES.desdeNoAnterior;

  if (!hasta.trim()) errores.hasta = MENSAJES.hastaObligatoria;
  else if (!fechaIsoValida(hasta)) errores.hasta = MENSAJES.hastaInvalida;
  else if (hasta > hoy) errores.hasta = MENSAJES.hastaPosterior;
  else if (!errores.desde && fechaIsoValida(desde) && hasta < desde)
    errores.hasta = MENSAJES.rangoInvertido;

  return errores;
}

/** Validación de formulario y de parámetros de URL con los mismos mensajes. */
export const rangoFormularioSchema = z
  .object({ desde: z.string(), hasta: z.string() })
  .superRefine((valores, ctx) => {
    // Se ejecuta al enviar en el navegador: usa el día actual en ese momento.
    const errores = validarRangoFechas(valores.desde, valores.hasta);
    if (errores.desde)
      ctx.addIssue({ code: "custom", path: ["desde"], message: errores.desde });
    if (errores.hasta)
      ctx.addIssue({ code: "custom", path: ["hasta"], message: errores.hasta });
  });

export type ValoresFormularioRango = z.infer<typeof rangoFormularioSchema>;

/** `hasta` anterior a hoy: el rango cerró, sin reconsultas automáticas. */
export function esRangoCerrado(hasta?: string, hoy = hoyIso()) {
  return Boolean(hasta && fechaIsoValida(hasta) && hasta < hoy);
}

/** `hasta` = hoy: la vista reconsulta cada una hora mientras permanezca abierta. */
export function esRangoDeHoy(hasta?: string, hoy = hoyIso()) {
  return Boolean(hasta && fechaIsoValida(hasta) && hasta === hoy);
}

export type FilaDistribucion = {
  nivel: NivelGravedad;
  etiqueta: string;
  clase: string;
  cantidad: number;
  porcentaje: number | null;
};

function filasDistribucion(
  items: DistribucionNivelItem[] | undefined | null,
  orden: readonly NivelGravedad[],
): FilaDistribucion[] {
  const porNivel = new Map<NivelGravedad, DistribucionNivelItem>();
  items?.forEach((item) => {
    if (esNivelGravedad(item?.nivel)) porNivel.set(item.nivel, item);
  });
  return orden.map((nivel) => {
    const item = porNivel.get(nivel);
    return {
      nivel,
      etiqueta: NIVEL_GRAVEDAD_LABELS[nivel],
      clase: NIVEL_GRAVEDAD_CLASS[nivel],
      cantidad: typeof item?.cantidad === "number" && Number.isFinite(item.cantidad) ? item.cantidad : 0,
      porcentaje: typeof item?.porcentaje === "number" && Number.isFinite(item.porcentaje) ? item.porcentaje : null,
    };
  });
}

/** Distribución del bot: los cinco niveles en orden de gravedad, cero si faltan; sin inventar categorías. */
export function distribucionBot(items: DistribucionNivelItem[] | undefined | null) {
  return filasDistribucion(items, [...NIVELES_GRAVEDAD_BOT, "SIN_CLASIFICACION_IA"]);
}

/** Distribución del médico: niveles en orden + SIN_REVISION siempre última; los desconocidos se omiten. */
export function distribucionMedico(items: DistribucionNivelItem[] | undefined | null) {
  return filasDistribucion(items, NIVELES_GRAVEDAD_MEDICO);
}

/** Escala común para las barras por día (ingresados y atendidos comparten techo). */
export function techoSerie(serie: SerieDiariaItem[] | undefined | null) {
  return Math.max(1, ...(serie ?? []).map((item) =>
    Math.max(
      typeof item?.ingresados === "number" && Number.isFinite(item.ingresados) ? item.ingresados : 0,
      typeof item?.atendidos === "number" && Number.isFinite(item.atendidos) ? item.atendidos : 0,
    ),
  ));
}
