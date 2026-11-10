import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { NextRequest, NextResponse } from "next/server.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { z } from "zod";

function loadTypeScript(relativePath, { fetch = globalThis.fetch, require = () => ({}), Date: DateImplementation = Date } = {}) {
  const filename = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, fetch, require, Request, Response, Headers, URL, Buffer, AbortSignal, process, setTimeout, Date: DateImplementation,
  }, { filename });
  return exports;
}

function loadReceptionDates(DateImplementation = Date) {
  const argentinaDate = loadTypeScript("lib/argentina-date.ts", { Date: DateImplementation });
  const receptionDate = loadTypeScript("features/reception/date-format.ts", {
    Date: DateImplementation,
    require: (specifier) => specifier === "@/lib/argentina-date" ? argentinaDate : {},
  });
  return { argentinaDate, receptionDate };
}

test("las fechas de la web usan DD/MM/AAAA y el día de Argentina", () => {
  const { argentinaDate, receptionDate } = loadReceptionDates();
  const { fechaIsoValida, formatoFechaIso, formatoFechaHoraArgentina, formatoHoraArgentina, hoyIso } = argentinaDate;

  assert.equal(fechaIsoValida("2024-02-29"), true);
  assert.equal(fechaIsoValida(null), false);
  assert.equal(fechaIsoValida("2023-02-29"), false);
  assert.equal(fechaIsoValida("2024-04-31"), false);
  assert.equal(fechaIsoValida("29/02/2024"), false);
  assert.equal(hoyIso(new Date("2026-11-09T02:30:00Z")), "2026-11-08");
  assert.equal(formatoFechaIso("2026-07-03"), "03/07/2026");
  assert.equal(formatoFechaHoraArgentina("2026-11-09T02:30:21Z"), "08/11/2026, 23:30:21");
  assert.equal(formatoFechaHoraArgentina("2026-11-09T02:30:21"), "09/11/2026, 02:30:21");
  assert.equal(formatoHoraArgentina("2026-11-09T02:30:21"), "02:30");
  const { min, max } = receptionDate.rangoFechaNacimiento("2020-02-29");
  assert.equal(min, "1900-02-28");
  assert.equal(max, "2020-02-28");
});

test("métricas valida el rango y conserva la proporción real en los gráficos", () => {
  const argentinaDate = loadTypeScript("lib/argentina-date.ts");
  const severity = loadTypeScript("lib/severity.ts");
  const { formatoPorcentajeEntero, porcentajeGrafico, validarRangoFechas, rangoEsteMes, rangoMesAnterior } = loadTypeScript("features/admin/hospital-metrics.ts", {
    require: (specifier) => ({
      zod: { z },
      "@/lib/argentina-date": argentinaDate,
      "@/lib/severity": severity,
    }[specifier] ?? {}),
  });
  const today = "2026-11-09";
  const rangeError = "La fecha hasta debe ser igual o posterior a la fecha desde.";
  assert.equal(Object.keys(validarRangoFechas("2026-11-08", "2026-11-08", today)).length, 0);
  assert.equal(validarRangoFechas("2026-11-08", "2026-11-07", today).hasta, rangeError);
  assert.deepEqual(Object.keys(validarRangoFechas("2026-11-08", today, today)), []);
  assert.deepEqual({ ...rangoEsteMes("2026-11-01") }, { desde: "2026-11-01", hasta: "2026-11-01" });
  assert.deepEqual({ ...rangoEsteMes("2026-11-09") }, { desde: "2026-11-01", hasta: "2026-11-09" });
  assert.deepEqual({ ...rangoMesAnterior("2026-01-01") }, { desde: "2025-12-01", hasta: "2025-12-31" });
  assert.deepEqual({ ...rangoMesAnterior("2024-03-01") }, { desde: "2024-02-01", hasta: "2024-02-29" });
  assert.equal(formatoPorcentajeEntero(0.5), 0);
  assert.equal(porcentajeGrafico(0.5), 0.5);
  assert.equal(porcentajeGrafico(0), 0);
  assert.equal(porcentajeGrafico(null), 0);
  assert.equal(porcentajeGrafico(3, 8), 37.5);
});

test("recepción ofrece planes publicados por prestador y conserva sus nombres", () => {
  const { obrasSociales, planesDeObraSocial } = loadTypeScript("features/reception/coverage-plans.ts");
  const openApi = JSON.parse(fs.readFileSync("contracts/pretriage-openapi.json", "utf8"));
  const planSchema = openApi.components.schemas.CredencialRequest.properties.plan;
  const planPattern = new RegExp(planSchema.pattern, "u");

  assert.equal(obrasSociales.length, 16);
  assert.ok(obrasSociales.every(({ planes }) => planes.length > 0));
  assert.ok(obrasSociales.flatMap(({ planes }) => planes).every((plan) =>
    plan.length <= planSchema.maxLength && planPattern.test(plan),
  ));
  assert.deepEqual(Array.from(planesDeObraSocial(" osde ")), ["210", "310", "410", "450", "510"]);
  assert.ok(planesDeObraSocial("medife").includes("Medife+"));
  assert.ok(planesDeObraSocial("UNION   PERSONAL").includes("UP10"));
  assert.ok(planesDeObraSocial("Accord Salud").includes("Accord 1.5"));
  assert.ok(planesDeObraSocial("OSPE").includes("A-401"));
  assert.deepEqual(Array.from(planesDeObraSocial("IOMA")), ["Cobertura general"]);
  assert.deepEqual(Array.from(planesDeObraSocial("Otro prestador")), []);
});

test("recepción envía el último día del mes de vencimiento en ISO", () => {
  const { vencimientoMesAIso, mesDeVencimiento, mesVencimientoMinimo } = loadReceptionDates().receptionDate;

  assert.equal(vencimientoMesAIso("2028-02"), "2028-02-29");
  assert.equal(vencimientoMesAIso("2027-02"), "2027-02-28");
  assert.equal(vencimientoMesAIso("2028-04"), "2028-04-30");
  assert.equal(vencimientoMesAIso("2028-12"), "2028-12-31");
  assert.equal(vencimientoMesAIso("2028-13"), null);
  assert.equal(vencimientoMesAIso("2028-00"), null);
  assert.equal(mesDeVencimiento("2028-02-05"), "2028-02");
  assert.equal(mesDeVencimiento(null), "");
  assert.equal(mesVencimientoMinimo("2028-02-28"), "2028-02");
  assert.equal(mesVencimientoMinimo("2028-02-29"), "2028-03");
});

test("recepción exige nacimiento anterior a hoy y admite hasta 120 años", () => {
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : ["2026-11-09T02:30:00Z"]));
    }
  }
  const { argentinaDate, receptionDate } = loadReceptionDates(FixedDate);
  const { patientSchema } = loadTypeScript("features/reception/schema.ts", {
    require(specifier) {
      if (specifier === "zod") return { z };
      if (specifier === "@/lib/argentina-date") return argentinaDate;
      if (specifier === "./date-format") return receptionDate;
      throw new Error(`Unexpected module: ${specifier}`);
    },
  });
  const patient = {
    dni: "12345678", nombre: "Paciente", apellido: "De prueba",
    generoBiologico: "FEMENINO", telefono: "1134567890", correoElectronico: "",
    calle: "Calle", alturaDomicilio: "100", piso: "", ciudad: "Almagro",
    provincia: "Ciudad Autónoma de Buenos Aires", codigoPostal: "", codigoEspecialidad: "CLINICA_MEDICA",
  };

  assert.equal(patientSchema.parse({ ...patient, fechaNacimiento: "1906-11-08" }).fechaNacimiento, "1906-11-08");
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "1906-11-07" }).success, false);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "1826-11-08" }).success, false);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "2026-11-08" }).success, false);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "2026-11-07" }).success, true);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "2026-11-07", generoBiologico: "" }).success, false);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "2026-11-07", generoBiologico: "X" }).success, false);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "2026-11-07", generoBiologico: "MASCULINO" }).success, true);
});

test("recepción conserva síntomas de borradores anteriores sin enviar campos retirados", () => {
  const { argentinaDate, receptionDate } = loadReceptionDates();
  const { clinicalSchema, restoreClinicalDraft, toTriageRequest } = loadTypeScript("features/reception/schema.ts", {
    require(specifier) {
      if (specifier === "zod") return { z };
      if (specifier === "@/lib/argentina-date") return argentinaDate;
      if (specifier === "./date-format") return receptionDate;
      if (specifier === "@/lib/embarazo") return loadTypeScript("lib/embarazo.ts");
      throw new Error(`Unexpected module: ${specifier}`);
    },
  });

  const draft = restoreClinicalDraft({
    motivoConsulta: "Malestar desde esta mañana",
    sintomas: "Náuseas, fiebre",
    inicio: "Esta mañana",
    fiebre: true,
    signosAlarma: "Dificultad para respirar",
    dolores: [{ localizacion: "abdomen", intensidad: "8" }],
    medicamentos: "Medicación habitual",
  });
  assert.equal(draft.evolucion, "");
  assert.equal(draft.sintomas, "Náuseas, fiebre\nDificultad para respirar\nDolor en abdomen (intensidad 8/10)");
  assert.equal(restoreClinicalDraft(draft).sintomas, draft.sintomas);
  assert.equal(clinicalSchema.safeParse(draft).success, false);

  const request = toTriageRequest(clinicalSchema.parse({ ...draft, evolucion: "estable" }), true);
  assert.deepEqual(Array.from(request.sintomas), ["Náuseas, fiebre", "Dificultad para respirar", "Dolor en abdomen (intensidad 8/10)"]);
  assert.deepEqual(Array.from(request.dolores), []);
  assert.deepEqual(Array.from(request.medicamentos), ["Medicación habitual"]);
  assert.equal("fiebre" in request, false);
  assert.equal("signosAlarma" in request, false);

  const pregnant = clinicalSchema.parse({ ...draft, evolucion: "estable", posibilidadEmbarazo: "si" });
  assert.equal(toTriageRequest(pregnant, true).posibilidadEmbarazo, "si");
  assert.equal(toTriageRequest(pregnant, false).posibilidadEmbarazo, "no aplica");
});

test("apiClient acepta 204 vacío, JSON 200 y conserva el error 409", async () => {
  const emptyResponseClient = loadTypeScript("lib/api/client.ts", {
    fetch: async () => new Response(null, { status: 204 }),
  });
  assert.equal(
    await emptyResponseClient.apiClient("/api/staff/admin", "deleteSector"),
    undefined,
  );

  const jsonClient = loadTypeScript("lib/api/client.ts", {
    fetch: async () => Response.json({ saved: true }),
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(await jsonClient.apiClient("/api/staff/admin", "bootstrap"))),
    { saved: true },
  );

  const conflictClient = loadTypeScript("lib/api/client.ts", {
    fetch: async () =>
      Response.json({ message: "El sector tiene sesiones vinculadas.", status: 409 }, { status: 409 }),
  });
  await assert.rejects(
    conflictClient.apiClient("/api/staff/admin", "deleteSector"),
    (error) =>
      error.name === "ClientApiError" &&
      error.status === 409 &&
      error.message === "El sector tiene sesiones vinculadas.",
  );
});

test("la ruta médica usa sectores, salas sectorizadas y envía sectorId al iniciar sesión", async () => {
  const calls = [];
  const route = loadTypeScript("app/api/staff/doctor/route.ts", {
    require: (specifier) => {
      if (specifier === "next/server") {
        return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      }
      if (specifier === "@/lib/api/route") {
        return { apiErrorResponse: (error) => Response.json({ message: error.message }, { status: 500 }) };
      }
      if (specifier === "@/lib/api/server") {
        return {
          backendRequest: async (url, init = {}) => {
            calls.push({ url, init });
            return { ok: true };
          },
        };
      }
      throw new Error(`Unexpected module: ${specifier}`);
    },
  });
  const post = (body) =>
    route.POST(
      new Request("http://localhost/api/staff/doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  assert.equal((await post({ operation: "sectors", hospitalId: 12, specialty: "CLINICA_MEDICA" })).status, 200);
  assert.equal((await post({ operation: "rooms", hospitalId: 12, sectorId: 7, specialty: "CLINICA_MEDICA" })).status, 200);
  assert.equal((await post({ operation: "startSession", hospitalId: 12, sectorId: 7, roomId: 5, specialty: "CLINICA_MEDICA" })).status, 200);

  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/hospitales/12/sectores?codigoEspecialidad=CLINICA_MEDICA",
    "/api/hospitales/12/sectores/7/salas?codigoEspecialidad=CLINICA_MEDICA",
    "/api/medico/sesiones",
  ]);
  assert.equal(calls[2].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    hospitalId: 12,
    codigoEspecialidad: "CLINICA_MEDICA",
    sectorId: 7,
    salaId: 5,
  });
});

test("la ruta médica separa selección, llamado y devolución y limita los adjuntos a vistas previas", async () => {
  const calls = [];
  let fileType = "application/pdf";
  const route = loadTypeScript("app/api/staff/doctor/route.ts", {
    require: (specifier) => ({
      "next/server": { NextResponse },
      "@/lib/api/route": {
        apiErrorResponse: (error) => Response.json({ message: error.message }, { status: error.status ?? 500 }),
      },
      "@/lib/api/server": {
        backendRequest: async (url, init = {}) => {
          calls.push([url, init.method ?? "GET", init.body ? JSON.parse(init.body) : null]);
          return {};
        },
        backendResponse: async (url) => {
          calls.push([url, "GET", null]);
          return new Response("archivo", {
            headers: { "Content-Type": fileType, "Content-Disposition": 'attachment; filename="estudio.pdf"' },
          });
        },
      },
    })[specifier],
  });
  const post = (operation, payload = {}) => route.POST(new Request("http://localhost/api/staff/doctor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, sessionId: 12, consultationId: 7, ...payload }),
  }));

  assert.equal((await post("selectNext")).status, 200);
  assert.equal((await post("consultationAction", { action: "llamar" })).status, 200);
  assert.equal((await post("consultationAction", { action: "devolver-a-cola" })).status, 200);
  assert.equal((await post("clinicalData")).status, 200);
  assert.equal((await post("symptomsDiscrepancy")).status, 200);
  assert.equal((await post("reportSymptomsDiscrepancy")).status, 200);

  const preview = await post("clinicalFile", { studyId: 5 });
  assert.equal(preview.headers.get("Content-Type"), "application/pdf");
  assert.equal(preview.headers.get("Content-Disposition"), null);
  assert.match(preview.headers.get("Cache-Control"), /no-store/);
  assert.equal(await preview.text(), "archivo");

  fileType = "image/svg+xml";
  assert.equal((await post("clinicalFile", { studyId: 5 })).status, 415);
  assert.equal((await post("clinicalFile", { studyId: "../5" })).status, 400);
  const download = await post("downloadClinicalFile", { studyId: 5 });
  assert.equal(download.headers.get("Content-Type"), "application/octet-stream");
  assert.equal(download.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(download.headers.get("Content-Disposition"), null);
  assert.equal(await download.text(), "archivo");

  const sessionPath = "/api/medico/sesiones/12";
  const consultationPath = `${sessionPath}/consultas/7`;
  const filePath = `${consultationPath}/datos-clinicos/estudios/5/archivo`;
  assert.deepEqual(calls, [
    [`${sessionPath}/seleccionar-proximo`, "POST", null],
    [`${consultationPath}/llamar`, "POST", null],
    [`${consultationPath}/devolver-a-cola`, "POST", null],
    [`${consultationPath}/datos-clinicos`, "GET", null],
    [`${consultationPath}/discrepancia-sintomas`, "GET", null],
    [`${consultationPath}/discrepancia-sintomas`, "PUT", null],
    [filePath, "GET", null],
    [filePath, "GET", null],
    [filePath, "GET", null],
  ]);
});

test("la ruta médica tolera endpoints opcionales ausentes sin ocultar errores de consulta ni mutaciones", async () => {
  class BackendApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  let error = new BackendApiError(404, "Recurso no encontrado.");
  const route = loadTypeScript("app/api/staff/doctor/route.ts", {
    require: (specifier) => ({
      "next/server": { NextResponse },
      "@/lib/api/route": {
        apiErrorResponse: (failure) => Response.json({ message: failure.message }, { status: failure.status ?? 500 }),
      },
      "@/lib/api/server": {
        BackendApiError,
        backendRequest: async () => { throw error; },
        backendResponse: async () => { throw error; },
      },
    })[specifier],
  });
  const post = (operation, payload = {}) => route.POST(new Request("http://localhost/api/staff/doctor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, sessionId: 12, consultationId: 7, ...payload }),
  }));

  for (const operation of ["clinicalData", "symptomsDiscrepancy"]) {
    const response = await post(operation);
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
    assert.match(response.headers.get("Cache-Control"), /no-store/);
  }
  assert.equal((await post("reportSymptomsDiscrepancy")).status, 404);
  assert.equal((await post("clinicalFile", { studyId: 5 })).status, 404);
  assert.equal((await post("pretriage")).status, 404);

  error = new BackendApiError(404, "Atención en curso no encontrada en la sesión");
  assert.equal((await post("clinicalData")).status, 404);
  assert.equal((await post("symptomsDiscrepancy")).status, 404);

  error = new BackendApiError(403, "No tiene permisos sobre la sesión");
  assert.equal((await post("clinicalData")).status, 403);

  error = new BackendApiError(503, "El archivo no está disponible en este momento.");
  assert.equal((await post("clinicalFile", { studyId: 5 })).status, 503);
});

test("la ficha clínica omite los pacientes de recepción con solo datos de identificación", () => {
  const argentinaDate = loadTypeScript("lib/argentina-date.ts");
  const { ClinicalHistory } = loadTypeScript("features/doctor/clinical-history.tsx", {
    require: (specifier) => ({
      react: React,
      "react/jsx-runtime": jsxRuntime,
      "@/lib/argentina-date": argentinaDate,
      "./pdf-preview": {},
    })[specifier],
  });
  const markup = (data) => renderToStaticMarkup(React.createElement(ClinicalHistory, {
    data,
    sessionId: 12,
    consultationId: 7,
  }));
  const admissionOnly = { fechaNacimiento: "1980-01-02", generoBiologico: "FEMENINO", estudios: [] };
  assert.equal(markup(admissionOnly), "");
  assert.equal(markup({}), "");
  assert.match(markup({ ...admissionOnly, peso: 70 }), /70 kg/);
  assert.match(markup({ estudios: [{ id: 5, nombreArchivo: "Estudio de prueba.pdf", extensionArchivo: "pdf" }] }), /Estudio de prueba.pdf/);
});

test("la ruta administrativa consulta sesiones del sector y finaliza conservando errores 409", async () => {
  const calls = [];
  let backendResult = [];
  let backendError = null;
  const chain = (parser = (value) => value) => ({
    parse: parser,
    trim() { return this; },
    min() { return this; },
    max() { return this; },
    int() { return this; },
    positive() { return this; },
    extend() { return this; },
  });
  const zod = {
    ZodError: class ZodError extends Error {},
    object: () => chain(),
    string: () => chain(),
    number: () => chain(),
    boolean: () => chain((value) => value),
  };
  const route = loadTypeScript("app/api/staff/admin/route.ts", {
    require: (specifier) => {
      if (specifier === "next/server") {
        return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      }
      if (specifier === "zod") return { z: zod };
      if (specifier === "@/lib/api/route") {
        return { apiErrorResponse: (error) => Response.json({ message: error.message }, { status: error.status ?? 500 }) };
      }
      if (specifier === "@/lib/api/server") {
        return {
          backendRequest: async (url, init = {}) => {
            calls.push({ url, init });
            if (backendError) throw backendError;
            return backendResult;
          },
        };
      }
      throw new Error(`Unexpected module: ${specifier}`);
    },
  });
  const post = (body) => route.POST(new Request("http://localhost/api/staff/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

  const sessionsResponse = await post({ operation: "sectorSessions", hospitalId: 12, sectorId: 7 });
  assert.equal(sessionsResponse.status, 200);
  assert.deepEqual(await sessionsResponse.json(), []);

  backendResult = { id: 23, estado: "FINALIZADA", sectorId: 7, salaId: 5 };
  const closedResponse = await post({ operation: "closeMedicalSession", hospitalId: 12, sectorId: 7, sessionId: 23 });
  assert.equal(closedResponse.status, 200);
  assert.deepEqual(await closedResponse.json(), backendResult);

  backendError = Object.assign(new Error("La sesión tiene un paciente en atención."), { status: 409 });
  const conflictResponse = await post({ operation: "closeMedicalSession", hospitalId: 12, sectorId: 7, sessionId: 23 });
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), { message: "La sesión tiene un paciente en atención." });

  assert.deepEqual(calls.map(({ url, init }) => [url, init.method ?? "GET"]), [
    ["/api/admin/hospitales/12/configuracion/sectores/7/sesiones", "GET"],
    ["/api/admin/hospitales/12/configuracion/sectores/7/sesiones/23/cerrar", "POST"],
    ["/api/admin/hospitales/12/configuracion/sectores/7/sesiones/23/cerrar", "POST"],
  ]);
});

test("administración lista y anula discrepancias dentro del hospital, sin enviar un motivo", async () => {
  const { paths } = JSON.parse(fs.readFileSync("contracts/pretriage-openapi.json", "utf8"));
  const doctorReport = paths["/api/medico/sesiones/{sesionId}/consultas/{consultaId}/discrepancia-sintomas"].put;
  const adminAnnul = paths["/api/admin/hospitales/{hospitalId}/discrepancias/{discrepanciaId}/anular"].post;
  assert.equal(doctorReport.requestBody, undefined);
  assert.equal(adminAnnul.requestBody, undefined);
  assert.ok(adminAnnul.responses["204"]);

  const calls = [];
  const record = {
    id: 9,
    pacienteNombre: "Paciente de prueba",
    pacienteDni: "12345678",
    medicoNombre: "Profesional de prueba",
    registradaEn: "2026-11-09T12:00:00Z",
    estado: "VIGENTE",
    sancion: { vigente: true, permanente: true, fechaFin: null },
  };
  let alreadyAnnulled = false;
  const route = loadTypeScript("app/api/staff/admin/route.ts", {
    require: (specifier) => ({
      "next/server": { NextResponse },
      "zod": { z },
      "@/lib/api/route": {
        apiErrorResponse: (error) => Response.json({ message: error.message }, { status: error.status }),
      },
      "@/lib/api/server": {
        backendRequest: async (url, init = {}) => {
          calls.push([url, init.method ?? "GET", init.body]);
          if (!init.method) return [record];
          if (alreadyAnnulled) throw Object.assign(new Error("La discrepancia ya está anulada."), { status: 409 });
          alreadyAnnulled = true;
          return null;
        },
      },
    })[specifier],
  });
  const post = (operation, payload = {}) => route.POST(new Request("http://localhost/api/staff/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, hospitalId: 12, ...payload }),
  }));
  const listed = await post("discrepancies");
  assert.deepEqual(await listed.json(), [record]);
  assert.match(listed.headers.get("Cache-Control"), /private, no-store/);
  assert.equal((await post("annulDiscrepancy", { discrepancyId: "9" })).status, 400);
  assert.equal((await post("annulDiscrepancy", { discrepancyId: 9 })).status, 204);
  assert.equal((await post("annulDiscrepancy", { discrepancyId: 9 })).status, 409);
  assert.deepEqual(calls, [
    ["/api/admin/hospitales/12/discrepancias", "GET", undefined],
    ["/api/admin/hospitales/12/discrepancias/9/anular", "POST", undefined],
    ["/api/admin/hospitales/12/discrepancias/9/anular", "POST", undefined],
  ]);
});

test("Personal suspende y reactiva solo el rol elegido de la membresía", async () => {
  const calls = [];
  let conflict = false;
  const route = loadTypeScript("app/api/staff/admin/route.ts", {
    require: (specifier) => ({
      "next/server": { NextResponse },
      "zod": { z },
      "@/lib/api/route": {
        apiErrorResponse: (error) => Response.json({ message: error.message }, { status: error.status }),
      },
      "@/lib/api/server": {
        backendRequest: async (url, init) => {
          const { estado } = JSON.parse(init.body);
          calls.push([url, init.method, estado]);
          if (conflict) throw Object.assign(new Error("La persona tiene una sesión abierta."), { status: 409 });
          return { membresiaId: 9, estado };
        },
      },
    })[specifier],
  });
  const update = (estado, role = "MEDICO") => route.POST(new Request("http://localhost/api/staff/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "setMembershipRoleState", hospitalId: 12, membershipId: 9, role, estado }),
  }));
  assert.equal((await update("ACTIVA", "NO_ROLE")).status, 400);
  assert.equal((await update("REVOCADA")).status, 400);
  assert.deepEqual(await (await update("SUSPENDIDA")).json(), { membresiaId: 9, estado: "SUSPENDIDA" });
  assert.deepEqual(await (await update("ACTIVA", "RECEPCIONISTA")).json(), { membresiaId: 9, estado: "ACTIVA" });
  conflict = true;
  const rejected = await update("SUSPENDIDA");
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).message, "La persona tiene una sesión abierta.");
  assert.deepEqual(calls, [
    ["/api/admin/hospitales/12/membresias/9/roles/MEDICO", "PATCH", "SUSPENDIDA"],
    ["/api/admin/hospitales/12/membresias/9/roles/RECEPCIONISTA", "PATCH", "ACTIVA"],
    ["/api/admin/hospitales/12/membresias/9/roles/MEDICO", "PATCH", "SUSPENDIDA"],
  ]);
});

test("recepción edita y elimina credenciales y guarda la selección por admisión", async () => {
  const calls = [];
  const route = loadTypeScript("app/api/staff/reception/route.ts", {
    require: (specifier) => {
      if (specifier === "next/server") return { NextResponse: { json: Response.json } };
      if (specifier === "@/lib/api/route") {
        return { apiErrorResponse: (error) => Response.json({ message: error.message }, { status: 500 }) };
      }
      if (specifier === "@/lib/api/server") {
        return { backendRequest: async (url, init) => {
          calls.push([url, init.method, init.body === undefined ? undefined : JSON.parse(init.body)]);
          return {};
        } };
      }
      throw new Error(`Unexpected module: ${specifier}`);
    },
  });
  const post = (body) => route.POST(new Request("http://localhost/api/staff/reception", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  const credential = { nombreObraSocial: "OSDE", numeroAfiliado: "12345678", plan: "310", fechaVencimiento: "2040-02-01" };

  assert.equal((await post({ operation: "updatePatientCredential", patientId: 2, credentialId: 9, credential })).status, 200);
  assert.equal((await post({ operation: "deletePatientCredential", patientId: 2, credentialId: 9 })).status, 200);
  assert.equal((await post({ operation: "deletePatientCredential", patientId: 2 })).status, 400);
  assert.equal((await post({ operation: "selectCoverage", admissionId: 7, credentialId: 9 })).status, 200);
  assert.equal((await post({ operation: "selectCoverage", admissionId: 7, credentialId: null })).status, 200);
  assert.equal((await post({ operation: "selectCoverage", admissionId: 7 })).status, 400);
  assert.deepEqual(calls, [
    ["/api/pacientes/2/obrasocial/credenciales/9", "PUT", credential],
    ["/api/pacientes/2/obrasocial/credenciales/9", "DELETE", undefined],
    ["/api/recepcion/admisiones/7/cobertura", "PUT", { credencialId: 9 }],
    ["/api/recepcion/admisiones/7/cobertura", "PUT", { credencialId: null }],
  ]);
});

function loadSessionMiddleware(fetch) {
  const cookies = loadTypeScript("lib/session-cookie.ts");
  const tokens = loadTypeScript("lib/session-tokens.ts", {
    require: (specifier) => ({
      "next/server": { NextResponse },
      "@/lib/session-cookie": cookies,
      zod: { z },
    })[specifier],
  });
  const { middleware } = loadTypeScript("middleware.ts", {
    fetch,
    require: (specifier) => ({
      "node:crypto": { createHash },
      "next/server": { NextResponse },
      "@/lib/session-cookie": cookies,
      "@/lib/session-tokens": tokens,
    })[specifier],
  });
  return middleware;
}

function fakeAccessToken(lifetimeSeconds) {
  const exp = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  return `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
}

function sessionRequest(pathname, access, refresh, method = "GET") {
  return new NextRequest(`http://localhost${pathname}`, {
    method,
    headers: { cookie: `pretriage_backend_token=${access}; pretriage_backend_refresh_token=${refresh}` },
  });
}

test("la web reserva la renovación preventiva para la sonda de sesión", async () => {
  const oldRefresh = "refresh-token-before-rotation";
  const tokens = { token: fakeAccessToken(3600), refreshToken: "refresh-token-after-rotation", renovarTokenEn: 3600 };
  const calls = [];
  const middleware = loadSessionMiddleware(async (url, options) => {
    calls.push([url.pathname, options.method, JSON.parse(options.body)]);
    return Response.json(tokens);
  });
  const access = fakeAccessToken(30);

  const ordinary = await middleware(sessionRequest("/api/staff/reception", access, oldRefresh));
  assert.equal(ordinary.headers.get("x-middleware-next"), "1");
  const legacyCheck = await middleware(sessionRequest("/api/auth/sesion", fakeAccessToken(-1), oldRefresh));
  assert.equal(legacyCheck.headers.get("x-middleware-next"), "1");
  assert.equal(calls.length, 0);

  const heartbeat = await middleware(sessionRequest("/api/auth/sesion", access, oldRefresh, "POST"));
  assert.deepEqual(calls, [["/api/renovar", "POST", { refreshToken: oldRefresh }]]);
  assert.equal(heartbeat.cookies.get("pretriage_backend_token").value, tokens.token);
  assert.equal(heartbeat.cookies.get("pretriage_backend_refresh_token").value, tokens.refreshToken);
  assert.ok(heartbeat.cookies.getAll().every((cookie) => cookie.httpOnly));
  assert.ok(heartbeat.headers.get("x-middleware-request-cookie").includes(tokens.token));
  assert.match(heartbeat.headers.get("cache-control"), /no-store/);
});

test("las solicitudes simultáneas con acceso vencido comparten una sola rotación", async () => {
  let respond;
  let calls = 0;
  const middleware = loadSessionMiddleware(() => {
    calls++;
    return new Promise((resolve) => { respond = resolve; });
  });
  const access = fakeAccessToken(-1);
  const refresh = "same-refresh-for-concurrent-requests";
  const page = middleware(sessionRequest("/recepcion", access, refresh));
  const heartbeat = middleware(sessionRequest("/api/auth/sesion", access, refresh, "POST"));
  assert.equal(calls, 1);
  const tokens = { token: fakeAccessToken(3600), refreshToken: "rotated-refresh-for-concurrent-requests", renovarTokenEn: 3600 };
  respond(Response.json(tokens));

  const [pageResponse, heartbeatResponse] = await Promise.all([page, heartbeat]);
  assert.deepEqual(pageResponse.cookies.getAll(), heartbeatResponse.cookies.getAll());
  assert.equal(pageResponse.cookies.get("pretriage_backend_refresh_token").value, tokens.refreshToken);

  const stale = await middleware(sessionRequest("/api/auth/sesion", access, refresh, "POST"));
  assert.equal(stale.status, 503);
  assert.equal(stale.cookies.getAll().length, 0);
  assert.equal(calls, 1);

  const invalidated = middleware(sessionRequest("/api/auth/sesion", access, "unrecognized-refresh-token", "POST"));
  assert.equal(calls, 2);
  respond(Response.json({}, { status: 401 }));
  const invalidResponse = await invalidated;
  assert.equal(invalidResponse.status, 401);
  assert.equal(invalidResponse.cookies.getAll().length, 3);
  assert.ok(invalidResponse.cookies.getAll().every((cookie) => cookie.maxAge === 0));
});

test("una falla temporal de renovación conserva las cookies y permite reintentar", async () => {
  const tokens = { token: fakeAccessToken(3600), refreshToken: "refresh-token-after-retry", renovarTokenEn: 3600 };
  let calls = 0;
  const middleware = loadSessionMiddleware(async () => {
    calls++;
    return calls === 1 ? Response.json({}, { status: 503 }) : Response.json(tokens);
  });
  const access = fakeAccessToken(30);
  const refresh = "refresh-token-that-can-be-retried";
  const request = () => sessionRequest("/api/auth/sesion", access, refresh, "POST");

  const unavailable = await middleware(request());
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.cookies.getAll().length, 0);
  const renewed = await middleware(request());
  assert.equal(renewed.cookies.get("pretriage_backend_refresh_token").value, tokens.refreshToken);
});

test("perfil del personal actualiza solo nombre y apellido del usuario autenticado", async () => {
  const calls = [];
  const profile = loadTypeScript("features/auth/staff-profile.ts");
  const { PUT } = loadTypeScript("app/api/staff/account/profile/route.ts", {
    require: (specifier) => ({
      "next/server": { NextResponse },
      zod: { z },
      "@/features/auth/staff-profile": profile,
      "@/lib/api/route": {
        apiErrorResponse: (error) => Response.json({ message: error.message }, { status: error.status }),
      },
      "@/lib/api/server": {
        backendRequest: async (path, options) => {
          const data = JSON.parse(options.body);
          calls.push({ path, method: options.method, data });
          if (data.nombre === "Bloqueado") {
            throw Object.assign(new Error("La sesión expiró."), { status: 401 });
          }
          return { ...data, id: "staff-fixture", email: "staff@example.test", membresias: [] };
        },
      },
    })[specifier],
  });

  const save = (data) => PUT(new Request("http://localhost/api/staff/account/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }));

  assert.equal((await save({ nombre: " ", apellido: "Pérez" })).status, 400);
  assert.equal((await save({ nombre: "A".repeat(121), apellido: "Pérez" })).status, 400);
  assert.equal(calls.length, 0);

  const updated = await save({
    nombre: "  María José ",
    apellido: " Pérez ",
    id: "another-user",
    email: "other@example.test",
    administradorPlataforma: true,
  });
  const names = { nombre: "María José", apellido: "Pérez" };
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), names);
  assert.deepEqual(calls, [{ path: "/api/staff/me", method: "PUT", data: names }]);
  assert.equal((await save({ nombre: "Bloqueado", apellido: "Pérez" })).status, 401);
});
