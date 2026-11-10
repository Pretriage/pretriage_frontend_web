/**
 * La posibilidad de embarazo sólo aplica a pacientes de género biológico femenino.
 */
export function aplicaEmbarazo(generoBiologico?: string | null) {
  return generoBiologico === "FEMENINO";
}

export const EMBARAZO_NO_APLICA = "no aplica";
