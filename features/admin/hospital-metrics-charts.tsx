"use client";

import { useState } from "react";
import { formatoFechaIso } from "@/lib/argentina-date";
import {
  formatoConteo,
  formatoPorcentajeEntero,
  formatoPromedio,
  porcentajeGrafico,
  techoSerie,
  type FilaDistribucion,
  type SerieDiariaItem,
} from "./hospital-metrics";

/** Porcentaje visible con truncado a la parte entera y falta de dato ("-"). */
function porcentajeVisible(porcentaje?: number | null) {
  const entero = formatoPorcentajeEntero(porcentaje);
  return entero === null ? "-" : `${entero}%`;
}

/** Porcentaje para nombres accesibles, sin ambigüedad cuando falta el dato. */
function porcentajeAccesible(porcentaje?: number | null) {
  const entero = formatoPorcentajeEntero(porcentaje);
  return entero === null ? "porcentaje sin dato" : `${entero} por ciento`;
}

function esperaAccesible(valor?: number | null) {
  const formateado = formatoPromedio(valor);
  return formateado === "-" ? "espera promedio sin dato" : `espera promedio ${formateado} minutos`;
}

/**
 * Gráfico vertical de una distribución por gravedad. Cada barra es un botón
 * seleccionable y el detalle se anuncia en una región viva; esta vista no
 * renderiza la tabla del modo horizontal.
 */
export function DistribucionVerticalGrafico({
  titulo,
  filas,
}: {
  titulo: string;
  filas: FilaDistribucion[];
}) {
  const [seleccion, setSeleccion] = useState<FilaDistribucion["nivel"] | null>(null);
  const filaSeleccionada = filas.find((fila) => fila.nivel === seleccion) ?? null;

  return (
    <div className="metrics-chart">
      <h3 className="metrics-chart-title">{titulo}</h3>
      <p className="metrics-chart-title">Altura: porcentaje del total de ingresos a la cola.</p>
      <div
        className="metrics-chart-scroll"
        role="region"
        aria-label={`${titulo}: gráfico de columnas`}
        tabIndex={0}
      >
        <div className="metrics-vchart">
          {filas.map((fila) => {
            const seleccionada = seleccion === fila.nivel;
            return (
              <button
                key={fila.nivel}
                type="button"
                className={`metrics-vbar${seleccionada ? " metrics-vbar-selected" : ""}`}
                aria-pressed={seleccionada}
                aria-label={`${fila.etiqueta}: ${formatoConteo(fila.cantidad)} casos, ${porcentajeAccesible(
                  fila.porcentaje,
                )}. ${seleccionada ? "Quitar el detalle" : "Seleccionar para ver el detalle"}.`}
                onClick={() =>
                  setSeleccion((actual) => (actual === fila.nivel ? null : fila.nivel))
                }
              >
                <span className="metrics-vbar-plot" aria-hidden="true">
                  <span className="metrics-vbar-track">
                    <span
                      className={`metrics-vbar-fill metrics-fill ${fila.clase}`}
                      style={{ height: `${porcentajeGrafico(fila.porcentaje)}%` }}
                    />
                  </span>
                </span>
                <span className="metrics-vbar-label" aria-hidden="true">{fila.etiqueta}</span>
                <span className="metrics-vbar-value" aria-hidden="true">
                  {formatoConteo(fila.cantidad)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="metrics-chart-detail" aria-live="polite" aria-atomic="true">
        {filaSeleccionada ? (
          <>
            <p className="metrics-chart-detail-title">{filaSeleccionada.etiqueta}</p>
            <dl className="metrics-chart-detail-grid">
              <div>
                <dt>Casos</dt>
                <dd>{formatoConteo(filaSeleccionada.cantidad)}</dd>
              </div>
              <div>
                <dt>Porcentaje</dt>
                <dd>{porcentajeVisible(filaSeleccionada.porcentaje)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="metrics-chart-hint">
            Seleccioná una barra para ver la información detallada.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Gráfico vertical de la serie diaria. Cada día es un botón con dos barras
 * (ingresados y atendidos) y el detalle completo se anuncia en una región viva.
 */
export function SerieVerticalGrafico({ serie }: { serie: SerieDiariaItem[] }) {
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const techo = techoSerie(serie);
  const diaSeleccionado = serie.find((dia) => (dia.fecha ?? "") === seleccion) ?? null;

  return (
    <div className="metrics-chart">
      <div className="metrics-chart-legend" aria-hidden="true">
        <span>
          <i className="metrics-chart-swatch metrics-bar-ingresados" />Ingresos a la cola (consultas)
        </span>
        <span>
          <i className="metrics-chart-swatch metrics-bar-atendidos" />Atenciones finalizadas (consultas)
        </span>
      </div>
      <div
        className="metrics-chart-scroll"
        role="region"
        aria-label="Ingresos a la cola y atenciones finalizadas por día; columnas en consultas"
        tabIndex={0}
      >
        <div className="metrics-vchart metrics-vchart-series">
          {serie.map((dia, indice) => {
            const fecha = dia.fecha ?? "";
            const seleccionado = seleccion === fecha;
            return (
              <button
                key={dia.fecha ?? `dia-${indice}`}
                type="button"
                className={`metrics-vbar${seleccionado ? " metrics-vbar-selected" : ""}`}
                aria-pressed={seleccionado}
                aria-label={`${formatoFechaIso(dia.fecha)}: ${formatoConteo(
                  dia.ingresados,
                )} ingresos a la cola, ${formatoConteo(dia.atendidos)} atenciones finalizadas, ${esperaAccesible(
                  dia.esperaPromedioMinutos,
                )}. ${seleccionado ? "Quitar el detalle" : "Seleccionar para ver el detalle"}.`}
                onClick={() => setSeleccion((actual) => (actual === fecha ? null : fecha))}
              >
                <span className="metrics-vbar-plot" aria-hidden="true">
                  <span className="metrics-vbar-pair">
                    <span
                      className="metrics-vbar-fill metrics-bar-ingresados"
                      style={{ height: `${porcentajeGrafico(dia.ingresados, techo)}%` }}
                    />
                    <span
                      className="metrics-vbar-fill metrics-bar-atendidos"
                      style={{ height: `${porcentajeGrafico(dia.atendidos, techo)}%` }}
                    />
                  </span>
                </span>
                <span className="metrics-vbar-label" aria-hidden="true">
                  {formatoFechaIso(dia.fecha)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="metrics-chart-detail" aria-live="polite" aria-atomic="true">
        {diaSeleccionado ? (
          <>
            <p className="metrics-chart-detail-title">{formatoFechaIso(diaSeleccionado.fecha)}</p>
            <dl className="metrics-chart-detail-grid">
              <div>
                <dt>Ingresos a la cola (consultas)</dt>
                <dd>{formatoConteo(diaSeleccionado.ingresados)}</dd>
              </div>
              <div>
                <dt>Atenciones finalizadas (consultas)</dt>
                <dd>{formatoConteo(diaSeleccionado.atendidos)}</dd>
              </div>
              <div>
                <dt>Espera promedio (minutos)</dt>
                <dd>{formatoPromedio(diaSeleccionado.esperaPromedioMinutos)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="metrics-chart-hint">
            Seleccioná un día para ver la información detallada.
          </p>
        )}
      </div>
    </div>
  );
}
