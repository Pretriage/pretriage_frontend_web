import { z } from "zod";
import type { components } from "@/contracts/pretriage-api";
import { fechaIsoValida, hoyIso } from "@/lib/argentina-date";
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

/** Proporción visual sin el truncado que se aplica a la etiqueta. */
export function porcentajeGrafico(valor?: number | null, techo = 100) {
  const numero = typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
  return Math.max(0, Math.min(100, (numero / techo) * 100));
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

type ErroresDeRango = { desde?: string; hasta?: string };

const MENSAJES = {
  desdeObligatoria: "La fecha desde es obligatoria.",
  desdeInvalida: "La fecha desde no es válida.",
  desdePosterior: "La fecha desde debe ser hoy o anterior.",
  hastaObligatoria: "La fecha hasta es obligatoria.",
  hastaInvalida: "La fecha hasta no es válida.",
  hastaPosterior: "La fecha hasta debe ser hoy o anterior.",
  rangoInvertido: "La fecha hasta debe ser igual o posterior a la fecha desde.",
} as const;

/** Reglas del rango inclusivo: desde <= hasta <= hoy. */
export function validarRangoFechas(
  desde: string,
  hasta: string,
  hoy = hoyIso(),
): ErroresDeRango {
  const errores: ErroresDeRango = {};

  if (!desde.trim()) errores.desde = MENSAJES.desdeObligatoria;
  else if (!fechaIsoValida(desde)) errores.desde = MENSAJES.desdeInvalida;
  else if (desde > hoy) errores.desde = MENSAJES.desdePosterior;

  if (!hasta.trim()) errores.hasta = MENSAJES.hastaObligatoria;
  else if (!fechaIsoValida(hasta)) errores.hasta = MENSAJES.hastaInvalida;
  else if (hasta > hoy) errores.hasta = MENSAJES.hastaPosterior;
  else if (!errores.desde && fechaIsoValida(desde) && hasta < desde)
    errores.hasta = MENSAJES.rangoInvertido;

  return errores;
}

/** Preset del mes actual, calculado con el día ISO de Argentina. */
export function rangoEsteMes(hoy = hoyIso()) {
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}

/** Mes calendario anterior completo, incluido el cambio de año. */
export function rangoMesAnterior(hoy = hoyIso()) {
  const primerDiaMesActual = new Date(`${hoy.slice(0, 7)}-01T00:00:00.000Z`);
  primerDiaMesActual.setUTCDate(0);
  const ultimoDiaAnterior = primerDiaMesActual.toISOString().slice(0, 10);
  return { desde: `${ultimoDiaAnterior.slice(0, 7)}-01`, hasta: ultimoDiaAnterior };
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
