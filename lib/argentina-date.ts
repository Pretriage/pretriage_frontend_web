export const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

const fechaArgentina = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_ARGENTINA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const horaArgentina = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_ARGENTINA,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function hoyIso(ahora = new Date()) {
  const partes = fechaArgentina.formatToParts(ahora);
  return ["year", "month", "day"].map((tipo) => partes.find(({ type }) => type === tipo)?.value).join("-");
}

export function ayerIso(hoy = hoyIso()) {
  const ayer = new Date(hoy + "T00:00:00.000Z");
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  return ayer.toISOString().slice(0, 10);
}

export function fechaIsoValida(valor: string | null | undefined): valor is string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(valor + "T00:00:00.000Z");
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function formatoFechaIso(valor?: string | null) {
  return fechaIsoValida(valor) ? valor.split("-").reverse().join("/") : "-";
}

function partesFechaHora(valor?: string | null) {
  if (!valor) return null;
  // Las fechas LocalDateTime de Spring representan horas sin zona.
  const local = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/.exec(valor);
  if (local) {
    const [, fecha, hora, segundo = "00"] = local;
    return fechaIsoValida(fecha) ? { fecha: formatoFechaIso(fecha), hora: `${hora}:${segundo}` } : null;
  }
  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) return null;
  return { fecha: fechaArgentina.format(instante), hora: horaArgentina.format(instante) };
}

export function formatoFechaHoraArgentina(valor?: string | null) {
  const partes = partesFechaHora(valor);
  return partes ? `${partes.fecha}, ${partes.hora}` : "-";
}

export function formatoHoraArgentina(valor?: string | null) {
  return partesFechaHora(valor)?.hora.slice(0, 5);
}
