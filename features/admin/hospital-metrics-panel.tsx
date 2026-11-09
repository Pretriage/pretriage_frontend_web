"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import type { HospitalRole } from "@/lib/staff-context";
import { StaffShell } from "@/components/staff-shell";
import { apiGet } from "@/lib/api/client";
import { DistribucionVerticalGrafico, SerieVerticalGrafico } from "./hospital-metrics-charts";
import { HospitalMetricsNavigation } from "./hospital-metrics-navigation";
import {
  ayerIso,
  distribucionBot,
  distribucionMedico,
  esRangoCerrado,
  esRangoDeHoy,
  formatoConteo,
  formatoFechaIso,
  formatoPorcentajeEntero,
  formatoPromedio,
  hoyIso,
  porcentajeDesdeConteos,
  rangoFormularioSchema,
  techoSerie,
  validarRangoFechas,
  type MetricasHospitalResponse,
  type ValoresFormularioRango,
} from "./hospital-metrics";

function AnilloPorcentaje({ etiqueta, porcentaje }: { etiqueta: string; porcentaje?: number | null }) {
  const entero = formatoPorcentajeEntero(porcentaje);
  const conDato = entero !== null;
  return (
    <svg
      viewBox="0 0 36 36"
      className="metrics-ring"
      role="img"
      aria-label={`${etiqueta}: ${conDato ? `${entero} por ciento` : "sin dato"}`}
    >
      <circle cx="18" cy="18" r="15.9155" fill="none" className="metrics-ring-track" />
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        className="metrics-ring-value"
        strokeDasharray={`${conDato ? entero : 0} 100`}
        strokeDashoffset="25"
        strokeLinecap="round"
      />
      <text x="18" y="20.5" textAnchor="middle" className="metrics-ring-number">
        {conDato ? `${entero}%` : "-"}
      </text>
    </svg>
  );
}

function KpiTarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="metrics-kpi">
      <span>{titulo}</span>
      <strong>{valor}</strong>
    </div>
  );
}

export function HospitalMetricsPanel({
  hospitalId,
  hospitalName,
  roles,
  canSwitchHospital,
  userName,
  desde: desdeUrl,
  hasta: hastaUrl,
  hoyInicial,
}: {
  hospitalId: number;
  hospitalName: string;
  roles: HospitalRole[];
  canSwitchHospital: boolean;
  userName: string;
  desde: string;
  hasta: string;
  /** Fecha del servidor para que el primer render coincida con la hidratación. */
  hoyInicial: string;
}) {
  const router = useRouter();
  const [hoy, setHoy] = useState(hoyInicial);
  // La orientación es local a cada sección: no vive en la URL ni en la query.
  const [vistaDistribuciones, setVistaDistribuciones] = useState<"horizontal" | "vertical">("horizontal");
  const [vistaSerie, setVistaSerie] = useState<"horizontal" | "vertical">("horizontal");

  // El servidor y el navegador pueden estar en husos distintos o cruzar la
  // medianoche: tras hidratar se adopta la fecha local del navegador.
  useEffect(() => {
    const actualizarHoy = () => setHoy(hoyIso());
    actualizarHoy();
    const intervalo = window.setInterval(actualizarHoy, 60_000);
    return () => window.clearInterval(intervalo);
  }, []);

  const conParametros = Boolean(desdeUrl || hastaUrl);
  // Remonta los gráficos al cambiar el rango consultado para limpiar la selección.
  const claveRango = `${desdeUrl}|${hastaUrl}`;
  const erroresUrl = useMemo(
    () => (conParametros ? validarRangoFechas(desdeUrl, hastaUrl, hoy) : {}),
    [conParametros, desdeUrl, hastaUrl, hoy],
  );
  const rangoUrlValido = Object.keys(erroresUrl).length === 0;

  const formRango = useForm<ValoresFormularioRango>({
    resolver: zodResolver(rangoFormularioSchema),
    defaultValues: { desde: desdeUrl, hasta: hastaUrl },
    mode: "onSubmit",
  });
  useEffect(() => {
    formRango.reset({ desde: desdeUrl, hasta: hastaUrl });
  }, [formRango, desdeUrl, hastaUrl]);
  const erroresForm = formRango.formState.errors;
  const desdeForm = useWatch({ control: formRango.control, name: "desde" });
  const hastaForm = useWatch({ control: formRango.control, name: "hasta" });

  const consulta = useQuery({
    queryKey: ["admin-metricas", hospitalId, desdeUrl, hastaUrl],
    queryFn: () =>
      apiGet<MetricasHospitalResponse>(
        `/api/staff/admin/metricas?hospitalId=${hospitalId}&desde=${desdeUrl}&hasta=${hastaUrl}`,
      ),
    enabled: conParametros && rangoUrlValido,
    staleTime: esRangoCerrado(hastaUrl, hoy) ? Infinity : 0,
    gcTime: esRangoCerrado(hastaUrl, hoy) ? Infinity : 5 * 60 * 1000,
    refetchInterval: esRangoDeHoy(hastaUrl, hoy) ? 3_600_000 : false,
    retry: false,
  });
  const enPendiente = conParametros && rangoUrlValido && consulta.isPending;

  // El error del deeplink deja de mostrarse en cuanto el campo cambia de valor;
  // al enviar, zod vuelve a validar el formulario completo.
  const errorDesde =
    erroresForm.desde?.message ?? (desdeForm === desdeUrl ? erroresUrl.desde : undefined);
  const errorHasta =
    erroresForm.hasta?.message ?? (hastaForm === hastaUrl ? erroresUrl.hasta : undefined);

  const enviarConsulta = formRango.handleSubmit((valores) => {
    if (enPendiente) return;
    router.replace(
      `/admin/hospital/metricas?hospitalId=${hospitalId}&desde=${valores.desde}&hasta=${valores.hasta}`,
      { scroll: false },
    );
  });

  const datos = consulta.data;
  const bot = datos ? distribucionBot(datos.distribucionGravedadBot) : [];
  const medico = datos ? distribucionMedico(datos.distribucionGravedadMedico) : [];
  const serie = datos?.serieDiaria ?? [];
  const techo = techoSerie(serie);
  const totalPretriage =
    typeof datos?.pretriageRealizado === "number" &&
    Number.isFinite(datos.pretriageRealizado) &&
    typeof datos?.pretriageNoRealizado === "number" &&
    Number.isFinite(datos.pretriageNoRealizado)
      ? datos.pretriageRealizado + datos.pretriageNoRealizado
      : null;
  const porcentajePretriageNoRealizado = porcentajeDesdeConteos(
    datos?.pretriageNoRealizado,
    totalPretriage,
  );

  return (
    <StaffShell
      role="Administración"
      userName={userName}
      section="Personal"
      sectionNavigation={<HospitalMetricsNavigation hospitalId={hospitalId} />}
      hospitalId={hospitalId}
      hospitalName={hospitalName}
      roles={roles}
      canSwitchHospital={canSwitchHospital}
    >
      <div className="page-stack admin-workspace">
        <header className="page-heading">
          <p className="eyebrow">Métricas del hospital</p>
          <h1>{hospitalName}</h1>
          <p>Consultá la atención, la cola y la gravedad de un período para encontrar mejoras.</p>
        </header>

        <section className="panel" aria-labelledby="metricas-consulta">
          <div className="panel-heading">
            <div>
              <h2 id="metricas-consulta" tabIndex={-1}>Consultar período</h2>
              <p>La fecha «desde» debe ser anterior a hoy. La fecha «hasta» puede ser hoy o anterior.</p>
            </div>
          </div>
          <form className="metrics-form" onSubmit={(evento) => void enviarConsulta(evento)} noValidate>
            <RequiredFieldsNote />
            <label className="field">
              <RequiredLabel>Desde</RequiredLabel>
              <input
                type="date"
                required
                {...formRango.register("desde")}
                max={ayerIso(hoy)}
                disabled={enPendiente}
                aria-invalid={errorDesde ? true : undefined}
                aria-describedby={errorDesde ? "metricas-desde-error" : undefined}
              />
              <span id="metricas-desde-error" className="field-error">{errorDesde ?? ""}</span>
            </label>
            <label className="field">
              <RequiredLabel>Hasta</RequiredLabel>
              <input
                type="date"
                required
                {...formRango.register("hasta")}
                max={hoy}
                disabled={enPendiente}
                aria-invalid={errorHasta ? true : undefined}
                aria-describedby={errorHasta ? "metricas-hasta-error" : undefined}
              />
              <span id="metricas-hasta-error" className="field-error">{errorHasta ?? ""}</span>
            </label>
            <button className="button button-primary" type="submit" disabled={enPendiente}>
              Consultar
            </button>
          </form>
        </section>

        {enPendiente ? <div className="loading-card" aria-live="polite">Consultando métricas…</div> : null}

        {consulta.error ? (
          <div className="notice notice-error" role="alert">{consulta.error.message}</div>
        ) : null}

        {!conParametros ? (
          <div className="panel metrics-empty">
            <strong>Sin consulta todavía</strong>
            <p>Elegí desde y hasta y presioná Consultar para ver las métricas del período.</p>
          </div>
        ) : null}

        {datos ? (
          <>
            <section className="panel" aria-labelledby="metricas-summary">
              <div className="panel-heading">
                <div>
                  <h2 id="metricas-summary" tabIndex={-1}>Resumen</h2>
                  <p>
                    Período del {formatoFechaIso(datos.desde ?? desdeUrl)} al {formatoFechaIso(datos.hasta ?? hastaUrl)}.
                  </p>
                </div>
              </div>
              <div className="metrics-grid">
                <KpiTarjeta titulo="Ingresados a la cola" valor={formatoConteo(datos.ingresaronACola)} />
                <KpiTarjeta titulo="Atendidos" valor={formatoConteo(datos.pacientesAtendidos)} />
                <KpiTarjeta titulo="No atendidos" valor={formatoConteo(datos.pacientesNoAtendidos)} />
                <div className="metrics-kpi">
                  <span>Porcentaje de atención</span>
                  <div className="metrics-kpi-ring">
                    <AnilloPorcentaje etiqueta="Porcentaje de atención" porcentaje={datos.porcentajeAtendidos} />
                  </div>
                </div>
                <KpiTarjeta titulo="Espera promedio en minutos" valor={formatoPromedio(datos.esperaPromedioMinutos)} />
                <div className="metrics-kpi">
                  <span>Pretriage realizado</span>
                  <div className="metrics-kpi-ring">
                    <AnilloPorcentaje etiqueta="Pretriage realizado" porcentaje={datos.porcentajePretriageRealizado} />
                    <small>
                      {formatoConteo(datos.pretriageRealizado)} de {formatoConteo(totalPretriage)}
                    </small>
                  </div>
                </div>
                <div className="metrics-kpi">
                  <span>Pretriage no realizado</span>
                  <div className="metrics-kpi-ring">
                    {/* El backend expone el porcentaje de "realizado"; el de
                        "no realizado" se deriva de los conteos y se trunca en
                        el anillo, sin inventar un complemento redondeado. */}
                    <AnilloPorcentaje
                      etiqueta="Pretriage no realizado"
                      porcentaje={porcentajePretriageNoRealizado}
                    />
                    <small>{formatoConteo(datos.pretriageNoRealizado)}</small>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel" aria-labelledby="metricas-distribucion">
              <div className="panel-heading metrics-section-heading">
                <div>
                  <h2 id="metricas-distribucion" tabIndex={-1}>Distribuciones</h2>
                  <p>Casos por gravedad asignada por el bot y revisada por el médico.</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary metrics-view-toggle"
                  onClick={() =>
                    setVistaDistribuciones((actual) => (actual === "horizontal" ? "vertical" : "horizontal"))
                  }
                >
                  {vistaDistribuciones === "horizontal"
                    ? "Cambiar vista a vertical"
                    : "Cambiar vista a horizontal"}
                </button>
              </div>
              {vistaDistribuciones === "horizontal" ? (
              <div className="metrics-columns">
                <div
                  className="metrics-table-wrap"
                  role="region"
                  aria-label="Gravedad asignada por el bot"
                  tabIndex={0}
                >
                  <table className="metrics-table">
                    <caption>Gravedad asignada por el bot</caption>
                  <thead>
                    <tr>
                      <th scope="col">Gravedad</th>
                      <th scope="col">Casos</th>
                      <th scope="col">Porcentaje</th>
                      <th scope="col" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {bot.map((fila) => (
                      <tr key={fila.nivel}>
                        <th scope="row">{fila.etiqueta}</th>
                        <td>{formatoConteo(fila.cantidad)}</td>
                        <td>{fila.porcentaje === null ? "-" : `${formatoPorcentajeEntero(fila.porcentaje)}%`}</td>
                        <td className="metrics-bar-cell">
                          <div className="metrics-bar" aria-hidden="true">
                            <div
                              className={`metrics-bar-fill metrics-fill ${fila.clase}`}
                              style={{ width: `${formatoPorcentajeEntero(fila.porcentaje) ?? 0}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
                <div
                  className="metrics-table-wrap"
                  role="region"
                  aria-label="Gravedad revisada por el médico"
                  tabIndex={0}
                >
                  <table className="metrics-table">
                    <caption>Gravedad revisada por el médico</caption>
                  <thead>
                    <tr>
                      <th scope="col">Revisión</th>
                      <th scope="col">Casos</th>
                      <th scope="col">Porcentaje</th>
                      <th scope="col" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {medico.map((fila) => (
                      <tr key={fila.nivel}>
                        <th scope="row">{fila.etiqueta}</th>
                        <td>{formatoConteo(fila.cantidad)}</td>
                        <td>{fila.porcentaje === null ? "-" : `${formatoPorcentajeEntero(fila.porcentaje)}%`}</td>
                        <td className="metrics-bar-cell">
                          <div className="metrics-bar" aria-hidden="true">
                            <div
                              className={`metrics-bar-fill metrics-fill ${fila.clase}`}
                              style={{ width: `${formatoPorcentajeEntero(fila.porcentaje) ?? 0}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>
              ) : (
                <div className="metrics-columns">
                  <DistribucionVerticalGrafico
                    key={`distribucion-bot-${claveRango}`}
                    titulo="Gravedad asignada por el bot"
                    filas={bot}
                  />
                  <DistribucionVerticalGrafico
                    key={`distribucion-medico-${claveRango}`}
                    titulo="Gravedad revisada por el médico"
                    filas={medico}
                  />
                </div>
              )}
            </section>

            <section className="panel" aria-labelledby="metricas-serie">
              <div className="panel-heading metrics-section-heading">
                <div>
                  <h2 id="metricas-serie" tabIndex={-1}>Serie diaria</h2>
                  <p>Ingresados y atendidos por día, incluidos los días sin atenciones.</p>
                </div>
                {serie.length ? (
                  <button
                    type="button"
                    className="button button-secondary metrics-view-toggle"
                    onClick={() =>
                      setVistaSerie((actual) => (actual === "horizontal" ? "vertical" : "horizontal"))
                    }
                  >
                    {vistaSerie === "horizontal"
                      ? "Cambiar vista a vertical"
                      : "Cambiar vista a horizontal"}
                  </button>
                ) : null}
              </div>
              {serie.length ? (
                vistaSerie === "horizontal" ? (
                <div
                  className="metrics-table-wrap"
                  role="region"
                  aria-label="Pacientes por día del período"
                  tabIndex={0}
                >
                  <table className="metrics-table">
                    <caption>Pacientes por día del período</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Ingresados</th>
                      <th scope="col">Atendidos</th>
                      <th scope="col">Espera promedio en minutos</th>
                      <th scope="col" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {serie.map((dia) => (
                      <tr key={dia.fecha}>
                        <th scope="row">{formatoFechaIso(dia.fecha)}</th>
                        <td>{formatoConteo(dia.ingresados)}</td>
                        <td>{formatoConteo(dia.atendidos)}</td>
                        <td>{formatoPromedio(dia.esperaPromedioMinutos)}</td>
                        <td className="metrics-bar-cell">
                          <div className="metrics-bar metrics-bar-pair" aria-hidden="true">
                            <div
                              className="metrics-bar-fill metrics-bar-ingresados"
                              style={{ width: `${Math.round((Math.max(dia.ingresados ?? 0, 0) / techo) * 100)}%` }}
                            />
                            <div
                              className="metrics-bar-fill metrics-bar-atendidos"
                              style={{ width: `${Math.round((Math.max(dia.atendidos ?? 0, 0) / techo) * 100)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
                ) : (
                  <SerieVerticalGrafico key={`serie-${claveRango}`} serie={serie} />
                )
              ) : (
                <p className="metrics-empty-note">El período consultado no reportó días de serie.</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </StaffShell>
  );
}
