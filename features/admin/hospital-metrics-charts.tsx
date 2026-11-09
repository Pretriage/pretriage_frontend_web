"use client";

import { useState } from "react";
import { formatoFechaIso } from "@/lib/argentina-date";
import {
  formatoConteo,
  formatoPorcentajeEntero,
  formatoPromedio,
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

/** Altura porcentual de una barra vertical; los valores ausentes quedan en cero. */
function alturaBarra(valor: number | null | undefined, techo = 100) {
  const numero = typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
  return Math.max(0, Math.min(100, (numero / techo) * 100));
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
                      style={{ height: `${alturaBarra(fila.porcentaje)}%` }}
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
          <i className="metrics-chart-swatch metrics-bar-ingresados" />Ingresados
        </span>
        <span>
          <i className="metrics-chart-swatch metrics-bar-atendidos" />Atendidos
        </span>
      </div>
      <div
        className="metrics-chart-scroll"
        role="region"
        aria-label="Pacientes por día del período: gráfico de columnas"
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
                )} ingresados, ${formatoConteo(dia.atendidos)} atendidos, ${esperaAccesible(
                  dia.esperaPromedioMinutos,
                )}. ${seleccionado ? "Quitar el detalle" : "Seleccionar para ver el detalle"}.`}
                onClick={() => setSeleccion((actual) => (actual === fecha ? null : fecha))}
              >
                <span className="metrics-vbar-plot" aria-hidden="true">
                  <span className="metrics-vbar-pair">
                    <span
                      className="metrics-vbar-fill metrics-bar-ingresados"
                      style={{ height: `${alturaBarra(dia.ingresados, techo)}%` }}
                    />
                    <span
                      className="metrics-vbar-fill metrics-bar-atendidos"
                      style={{ height: `${alturaBarra(dia.atendidos, techo)}%` }}
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
                <dt>Ingresados</dt>
                <dd>{formatoConteo(diaSeleccionado.ingresados)}</dd>
              </div>
              <div>
                <dt>Atendidos</dt>
                <dd>{formatoConteo(diaSeleccionado.atendidos)}</dd>
              </div>
              <div>
                <dt>Espera promedio</dt>
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
