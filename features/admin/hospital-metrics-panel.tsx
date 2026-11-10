"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { DatePicker } from "@/components/date-picker";
import { RequiredFieldsNote, RequiredLabel } from "@/components/required-field";
import type { HospitalRole } from "@/lib/staff-context";
import { StaffShell } from "@/components/staff-shell";
import { apiGet } from "@/lib/api/client";
import { formatoFechaIso, hoyIso } from "@/lib/argentina-date";
import { DistribucionVerticalGrafico, SerieVerticalGrafico } from "./hospital-metrics-charts";
import { HospitalAdminNavigation } from "./hospital-admin-navigation";
import {
  distribucionBot,
  distribucionMedico,
  esRangoCerrado,
  esRangoDeHoy,
  formatoConteo,
  formatoPorcentajeEntero,
  formatoPromedio,
  porcentajeDesdeConteos,
  porcentajeGrafico,
  rangoFormularioSchema,
  rangoEsteMes,
  rangoMesAnterior,
  techoSerie,
  validarRangoFechas,
  type MetricasHospitalResponse,
  type ValoresFormularioRango,
} from "./hospital-metrics";

function AnilloPorcentaje({ etiqueta, porcentaje }: { etiqueta: string; porcentaje?: number | null }) {
  const entero = formatoPorcentajeEntero(porcentaje);
  const conDato = entero !== null;
  const geometria = porcentajeGrafico(porcentaje);
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
        pathLength="100"
        strokeDasharray={`${geometria} ${100 - geometria}`}
        strokeDashoffset="25"
        strokeLinecap="round"
        visibility={geometria > 0 ? "visible" : "hidden"}
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
  const [modoPeriodo, setModoPeriodo] = useState<"este-mes" | "mes-anterior" | "personalizado">("este-mes");
  // La orientación es local a cada sección: no vive en la URL ni en la query.
  const [vistaDistribuciones, setVistaDistribuciones] = useState<"horizontal" | "vertical">("horizontal");
  const [vistaSerie, setVistaSerie] = useState<"horizontal" | "vertical">("horizontal");

  // Actualiza el día de Argentina si la pantalla sigue abierta a medianoche.
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
    if (desdeUrl || hastaUrl) {
      const actual = rangoEsteMes(hoyInicial);
      const previo = rangoMesAnterior(hoyInicial);
      setModoPeriodo(desdeUrl === actual.desde && hastaUrl === actual.hasta
        ? "este-mes"
        : desdeUrl === previo.desde && hastaUrl === previo.hasta
          ? "mes-anterior"
          : "personalizado");
    } else {
      const actual = rangoEsteMes(hoyInicial);
      formRango.reset(actual);
      setModoPeriodo("este-mes");
    }
  }, [formRango, desdeUrl, hastaUrl, hoyInicial]);
  const erroresForm = formRango.formState.errors;
  const desdeForm = useWatch({ control: formRango.control, name: "desde" });
  const hastaForm = useWatch({ control: formRango.control, name: "hasta" });
  const presetActivo = modoPeriodo;

  const aplicarRango = (rango: { desde: string; hasta: string }, modo: "este-mes" | "mes-anterior") => {
    formRango.setValue("desde", rango.desde, { shouldDirty: true, shouldValidate: false });
    formRango.setValue("hasta", rango.hasta, { shouldDirty: true, shouldValidate: false });
    formRango.clearErrors(["desde", "hasta"]);
    setModoPeriodo(modo);
  };

  const personalizar = () => {
    setModoPeriodo("personalizado");
    formRango.setFocus("desde");
  };

  const cambiarFecha = (campo: "desde" | "hasta", valor: string, onChange: (valor: string) => void) => {
    onChange(valor);
    setModoPeriodo("personalizado");
  };

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
    const rango = modoPeriodo === "este-mes" ? rangoEsteMes(hoyIso()) : valores;
    router.replace(
      `/admin/hospital/metricas?hospitalId=${hospitalId}&desde=${rango.desde}&hasta=${rango.hasta}`,
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
      sectionNavigation={<HospitalAdminNavigation hospitalId={hospitalId} activeSection="metricas" />}
      hospitalId={hospitalId}
      hospitalName={hospitalName}
      roles={roles}
      canSwitchHospital={canSwitchHospital}
    >
      <div className="page-stack admin-workspace">
        <header className="page-heading">
          <p className="eyebrow">Métricas del hospital</p>
          <h1>Métricas de atención</h1>
          <p>{hospitalName}. Los resultados se agrupan por fecha de ingreso del paciente a la cola.</p>
        </header>

        <section className="panel" aria-labelledby="metricas-consulta">
          <div className="panel-heading">
            <div>
              <h2 id="metricas-consulta" tabIndex={-1}>Consultar período</h2>
              <p>Elegí un período o ajustá las fechas. El rango incluye desde y hasta.</p>
            </div>
          </div>
          <form className="metrics-form" onSubmit={(evento) => void enviarConsulta(evento)} noValidate>
            <RequiredFieldsNote />
            <fieldset className="metrics-presets" aria-label="Período de métricas">
              <legend>Período</legend>
              <button type="button" className={`button ${presetActivo === "este-mes" ? "button-primary" : "button-secondary"}`} aria-pressed={presetActivo === "este-mes"} disabled={enPendiente} onClick={() => aplicarRango(rangoEsteMes(hoyIso()), "este-mes")}>Este mes</button>
              <button type="button" className={`button ${presetActivo === "mes-anterior" ? "button-primary" : "button-secondary"}`} aria-pressed={presetActivo === "mes-anterior"} disabled={enPendiente} onClick={() => aplicarRango(rangoMesAnterior(hoyIso()), "mes-anterior")}>Mes anterior</button>
              <button type="button" className={`button ${presetActivo === "personalizado" ? "button-primary" : "button-secondary"}`} aria-pressed={presetActivo === "personalizado"} disabled={enPendiente} onClick={personalizar}>Personalizado</button>
            </fieldset>
            <div className="field">
              <label htmlFor="metrics-start-date"><RequiredLabel>Desde</RequiredLabel></label>
              <Controller
                control={formRango.control}
                name="desde"
                render={({ field }) => (
                  <DatePicker
                  {...field}
                  onChange={(valor) => cambiarFecha("desde", valor, field.onChange)}
                    id="metrics-start-date"
                    required
                    max={hoy}
                    disabled={enPendiente}
                    aria-invalid={errorDesde ? true : undefined}
                    aria-describedby={errorDesde ? "metricas-desde-error" : undefined}
                  />
                )}
              />
              <span id="metricas-desde-error" className="field-error">{errorDesde ?? ""}</span>
            </div>
            <div className="field">
              <label htmlFor="metrics-end-date"><RequiredLabel>Hasta</RequiredLabel></label>
              <Controller
                control={formRango.control}
                name="hasta"
                render={({ field }) => (
                  <DatePicker
                  {...field}
                  onChange={(valor) => cambiarFecha("hasta", valor, field.onChange)}
                    id="metrics-end-date"
                    required
                    max={hoy}
                    disabled={enPendiente}
                    aria-invalid={errorHasta ? true : undefined}
                    aria-describedby={errorHasta ? "metricas-hasta-error" : undefined}
                  />
                )}
              />
              <span id="metricas-hasta-error" className="field-error">{errorHasta ?? ""}</span>
            </div>
            <button className="button button-primary metrics-submit" type="submit" disabled={enPendiente}>
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
                  <h2 id="metricas-summary" tabIndex={-1}>Atención y pretriage</h2>
                  <p>
                    Período del {formatoFechaIso(datos.desde ?? desdeUrl)} al {formatoFechaIso(datos.hasta ?? hastaUrl)}.
                  </p>
                </div>
              </div>
              <div className="metrics-grid">
                <KpiTarjeta titulo="Ingresos a la cola" valor={formatoConteo(datos.ingresaronACola)} />
                <KpiTarjeta titulo="Atenciones finalizadas" valor={formatoConteo(datos.pacientesAtendidos)} />
                <KpiTarjeta titulo="Ingresos sin atención finalizada" valor={formatoConteo(datos.pacientesNoAtendidos)} />
                <div className="metrics-kpi">
                  <span>Ingresos con atención finalizada</span>
                  <div className="metrics-kpi-ring">
                    <AnilloPorcentaje etiqueta="Ingresos con atención finalizada" porcentaje={datos.porcentajeAtendidos} />
                  </div>
                </div>
                <KpiTarjeta titulo="Tiempo promedio de espera (minutos)" valor={formatoPromedio(datos.esperaPromedioMinutos)} />
                <div className="metrics-kpi">
                  <span>Pretriage IA completado</span>
                  <div className="metrics-kpi-ring">
                    <AnilloPorcentaje etiqueta="Pretriage IA completado" porcentaje={datos.porcentajePretriageRealizado} />
                    <small>
                      {formatoConteo(datos.pretriageRealizado)} de {formatoConteo(totalPretriage)}
                    </small>
                  </div>
                </div>
                <div className="metrics-kpi">
                  <span>Pretriage IA no completado</span>
                  <div className="metrics-kpi-ring">
                    {/* El backend expone el porcentaje de "realizado"; el de
                        "no realizado" se deriva de los conteos y se trunca en
                        el anillo, sin inventar un complemento redondeado. */}
                    <AnilloPorcentaje
                      etiqueta="Pretriage IA no completado"
                      porcentaje={porcentajePretriageNoRealizado}
                    />
                    <small>{formatoConteo(datos.pretriageNoRealizado)}</small>
                  </div>
                </div>
              </div>
              <p className="metrics-empty-note">
                Ingresos y atenciones se cuentan según la fecha de ingreso a la cola. Una atención cuenta como realizada al finalizarse.
                El pretriage IA incluye chats completados y no incluye las admisiones de recepción.
              </p>
            </section>

            <section className="panel" aria-labelledby="metricas-distribucion">
              <div className="panel-heading metrics-section-heading">
                <div>
                  <h2 id="metricas-distribucion" tabIndex={-1}>Casos por nivel de gravedad</h2>
                  <p>Clasificación inicial del bot (incluye casos sin clasificación) y gravedad registrada por el médico (incluye casos sin revisión).</p>
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
                  aria-label="Clasificación inicial del bot"
                  tabIndex={0}
                >
                  <table className="metrics-table">
                    <caption>Clasificación inicial del bot</caption>
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
                              style={{ width: `${porcentajeGrafico(fila.porcentaje)}%` }}
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
                  aria-label="Gravedad registrada por el médico"
                  tabIndex={0}
                >
                  <table className="metrics-table">
                    <caption>Gravedad registrada por el médico</caption>
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
                              style={{ width: `${porcentajeGrafico(fila.porcentaje)}%` }}
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
                    titulo="Clasificación inicial del bot"
                    filas={bot}
                  />
                  <DistribucionVerticalGrafico
                    key={`distribucion-medico-${claveRango}`}
                    titulo="Gravedad registrada por el médico"
                    filas={medico}
                  />
                </div>
              )}
            </section>

            <section className="panel" aria-labelledby="metricas-serie">
              <div className="panel-heading metrics-section-heading">
                <div>
                  <h2 id="metricas-serie" tabIndex={-1}>Ingresos y atenciones por día</h2>
                  <p>Por fecha de ingreso a la cola: pacientes ingresados, atenciones finalizadas y espera promedio.</p>
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
                  aria-label="Ingresos y atenciones finalizadas por fecha de ingreso"
                  tabIndex={0}
                >
                  <table className="metrics-table">
                    <caption>Ingresos y atenciones finalizadas por fecha de ingreso</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Ingresados</th>
                      <th scope="col">Atenciones finalizadas</th>
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
                              style={{ width: `${porcentajeGrafico(dia.ingresados, techo)}%` }}
                            />
                            <div
                              className="metrics-bar-fill metrics-bar-atendidos"
                              style={{ width: `${porcentajeGrafico(dia.atendidos, techo)}%` }}
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
