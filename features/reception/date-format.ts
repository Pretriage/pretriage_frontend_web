const formatoFechaArgentina = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hoyIso(ahora = new Date()) {
  const partes = formatoFechaArgentina.formatToParts(ahora);
  return ["year", "month", "day"].map((tipo) => partes.find(({ type }) => type === tipo)?.value).join("-");
}

export function fechaLocalAIso(valor: string): string | null {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!partes) return null;
  const [, dia, mes, anio] = partes;
  const iso = `${anio}-${mes}-${dia}`;
  const fecha = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === iso ? iso : null;
}

export function fechaIsoALocal(valor: string | null | undefined) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor ?? "");
  if (!partes) return "";
  const [, anio, mes, dia] = partes;
  return `${dia}/${mes}/${anio}`;
}
