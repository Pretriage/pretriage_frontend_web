import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
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
    },
    fileName: filename,
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, fetch, require, Request, Response, Date: DateImplementation }, { filename });
  return exports;
}

test("recepción convierte fechas argentinas a ISO sin aceptar días inexistentes", () => {
  const { fechaLocalAIso, fechaIsoALocal, hoyIso } = loadTypeScript("features/reception/date-format.ts");

  assert.equal(fechaIsoALocal("2024-02-29"), "29/02/2024");
  assert.equal(fechaIsoALocal(null), "");
  assert.equal(fechaLocalAIso("29/02/2024"), "2024-02-29");
  assert.equal(fechaLocalAIso("29/02/2023"), null);
  assert.equal(fechaLocalAIso("31/04/2024"), null);
  assert.equal(fechaLocalAIso("2024-02-29"), null);
  assert.equal(hoyIso(new Date("2026-11-09T02:30:00Z")), "2026-11-08");
});

test("recepción exige nacimiento anterior a hoy y admite hasta 120 años", () => {
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : ["2026-11-09T02:30:00Z"]));
    }
  }
  const dateFormat = loadTypeScript("features/reception/date-format.ts", { Date: FixedDate });
  const { patientSchema } = loadTypeScript("features/reception/schema.ts", {
    require(specifier) {
      if (specifier === "zod") return { z };
      if (specifier === "./date-format") return dateFormat;
      throw new Error(`Unexpected module: ${specifier}`);
    },
  });
  const patient = {
    dni: "12345678", nombre: "Paciente", apellido: "De prueba",
    generoBiologico: "X", telefono: "1134567890", correoElectronico: "",
    calle: "Calle", alturaDomicilio: "100", piso: "", ciudad: "Almagro",
    provincia: "Ciudad Autónoma de Buenos Aires", codigoPostal: "", codigoEspecialidad: "CLINICA_MEDICA",
  };

  assert.equal(patientSchema.parse({ ...patient, fechaNacimiento: "08/11/1906" }).fechaNacimiento, "1906-11-08");
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "07/11/1906" }).success, false);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "08/11/1826" }).success, false);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "08/11/2026" }).success, false);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "07/11/2026" }).success, true);
  assert.equal(patientSchema.safeParse({ ...patient, fechaNacimiento: "07/11/2026", generoBiologico: "" }).success, false);
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

test("recepción edita la credencial y guarda la selección de cobertura por admisión", async () => {
  const calls = [];
  const route = loadTypeScript("app/api/staff/reception/route.ts", {
    require: (specifier) => {
      if (specifier === "next/server") return { NextResponse: { json: Response.json } };
      if (specifier === "@/lib/api/route") {
        return { apiErrorResponse: (error) => Response.json({ message: error.message }, { status: 500 }) };
      }
      if (specifier === "@/lib/api/server") {
        return { backendRequest: async (url, init) => {
          calls.push([url, init.method, JSON.parse(init.body)]);
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
  assert.equal((await post({ operation: "selectCoverage", admissionId: 7, credentialId: 9 })).status, 200);
  assert.equal((await post({ operation: "selectCoverage", admissionId: 7, credentialId: null })).status, 200);
  assert.equal((await post({ operation: "selectCoverage", admissionId: 7 })).status, 400);
  assert.deepEqual(calls, [
    ["/api/pacientes/2/obrasocial/credenciales/9", "PUT", credential],
    ["/api/recepcion/admisiones/7/cobertura", "PUT", { credencialId: 9 }],
    ["/api/recepcion/admisiones/7/cobertura", "PUT", { credencialId: null }],
  ]);
});
