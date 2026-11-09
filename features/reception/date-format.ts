import { ayerIso, fechaIsoValida, hoyIso } from "@/lib/argentina-date";

export const EDAD_MAXIMA_NACIMIENTO = 120;

export function rangoFechaNacimiento(hoy = hoyIso()) {
  const [anio, mes, dia] = hoy.split("-");
  const anioMinimo = Number(anio) - EDAD_MAXIMA_NACIMIENTO;
  const ultimoDiaMes = new Date(Date.UTC(anioMinimo, Number(mes), 0)).getUTCDate();
  return {
    min: `${String(anioMinimo).padStart(4, "0")}-${mes}-${String(Math.min(Number(dia), ultimoDiaMes)).padStart(2, "0")}`,
    max: ayerIso(hoy),
  };
}

export function vencimientoMesAIso(valor: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return null;
  const ultimoDia = new Date(valor + "-01T00:00:00.000Z");
  ultimoDia.setUTCMonth(ultimoDia.getUTCMonth() + 1, 0);
  return ultimoDia.toISOString().slice(0, 10);
}

export function mesDeVencimiento(valor: string | null | undefined) {
  return fechaIsoValida(valor) ? valor.slice(0, 7) : "";
}

export function mesVencimientoMinimo(hoy = hoyIso()) {
  const maniana = new Date(hoy + "T00:00:00.000Z");
  maniana.setUTCDate(maniana.getUTCDate() + 1);
  return maniana.toISOString().slice(0, 7);
}
