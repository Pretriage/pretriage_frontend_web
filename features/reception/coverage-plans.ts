export const obrasSociales = [
  { nombre: "OSDE", planes: ["210", "310", "410", "450", "510"] },
  { nombre: "Swiss Medical", planes: ["SMG02", "SMG20", "SMG30", "SMG40"] },
  { nombre: "Galeno", planes: ["220", "330", "440", "550"] },
  { nombre: "Medifé", planes: ["Bronce", "Bronce Classic", "Plata", "Plata Classic", "Oro", "Platinum", "Juntos", "Medife+"] },
  { nombre: "Omint", planes: ["1500", "2500", "2600", "4021", "4500", "6500", "8500"] },
  { nombre: "SanCor Salud", planes: ["F700", "F800", "F801", "S1000", "S1500", "S3000", "S3500", "S4000", "S4500", "S5000", "S6000"] },
  { nombre: "Accord Salud", planes: ["Accord 1.5", "Accord 2.2", "Accord 3.2", "Accord 4.2", "Accord 110", "Accord 210", "Accord 310"] },
  { nombre: "Unión Personal", planes: ["Classic", "Familiar", "UP10", "PMO", "Monotributista"] },
  { nombre: "OSECAC", planes: ["Cobertura general PMO"] },
  { nombre: "OSDEPYM", planes: ["800", "Staff", "1000", "2000", "2500", "3000", "4000", "Personal"] },
  { nombre: "OSPE", planes: ["A-401", "A-608", "A-706"] },
  { nombre: "OSUTHGRA", planes: ["Cobertura general PMO"] },
  { nombre: "OSPERYH", planes: ["Programa Médico OSPERYH"] },
  { nombre: "IOMA", planes: ["Cobertura general"] },
  { nombre: "PAMI", planes: ["Cobertura general"] },
  { nombre: "DOSUBA", planes: ["General", "Estudiantes y Graduados"] },
] as const;

export function claveObraSocial(nombre?: string | null) {
  return (nombre ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toUpperCase();
}

const planesPorObraSocial = new Map<string, readonly string[]>(
  obrasSociales.map(({ nombre, planes }) => [claveObraSocial(nombre), planes]),
);

export function planesDeObraSocial(nombre?: string | null): readonly string[] {
  return planesPorObraSocial.get(claveObraSocial(nombre)) ?? [];
}
