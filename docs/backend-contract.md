# Backend contract

- Local repository: `C:\Users\valen\Documents\Facultad\Proyecto\pretriage_backend`
- Base URL: `http://localhost:8080`
- Live OpenAPI: `http://localhost:8080/v3/api-docs`
- Exported snapshot: `contracts/pretriage-openapi.json`
- Snapshot date: 2026-11-05
- Snapshot SHA-256: `e64866621d72e08fd569dcb3c9f8b50a690edccaf1e421f5786c08d48c12e718`
- OpenAPI version: 3.1.0
- API title/version: Pretriage API / v1
- Snapshot size: 86 paths and 79 schemas

The snapshot and TypeScript types were refreshed from the running backend. They
include the consultation-scoped partial-pretriage conversation fields and chat
classification retry endpoint, sector-session administration endpoints, and
the hospital metrics distribution category for consultations without a valid
completed AI classification. The old optional estimated-time range is no longer
exported; the reception adapter retains read compatibility with that earlier
response while current responses use `fechaHoraAtencionEstimada`.

## Metrics contract

Snapshot entry: `GET /api/admin/hospitales/{hospitalId}/metricas`.

- Path parameter: `hospitalId` (`integer`, `int64`, required).
- Query parameters: `desde` and `hasta` (`string` with format `date`,
  `yyyy-MM-dd`, both required).
- Tag: `metricas-hospital-controller`, operation `obtenerMetricas`.

Authorization:

- Without a session the backend returns `401` (verified live-offline in this
  session's export refresh).
- The backend is expected to enforce `exigirAdminHospital` for the selected
  hospital and respond `403` to an admin of a different hospital, consistent
  with every other admin hospital route. Live confirmation with a valid
  `ADMIN_HOSPITAL` session is still pending and must be recorded here when it
  is available. The web never sends foreign hospital IDs: its page resolves
  the hospital from the staff membership context.

Business rules (backend-owned; the web only forwards and displays):

- The backend validates the date range and answers `400` with a descriptive
  `message` for an inverted range (`desde` > `hasta`), dates in the future
  relative to today, and the maximum admissible range extension (exact
  ceiling not confirmed from this machine). The web displays that message as
  a notice and does not normalize or re-validate these rules locally.
- `serieDiaria` is expected to cover the complete inclusive range including
  zero-patient days, per the response contract. Live confirmation pending.

### Verification status of this session

Verified against the local backend while implementing the metrics view:

- Without a session, the reading BFF and its page guard answer `401` /
  redirect to login; the endpoint itself answers `401` without a bearer token.
- The BFF validates only the form: missing parameters, a malformed date, or a
  non-positive `hospitalId` return `400` with its own message ("Revisá el
  hospital y las fechas indicadas.") without touching the backend.
- A well-formed query is forwarded with the session's bearer token; the
  backend's own rejection (observed with a structurally valid but revoked
  token) passes through as the normalized `401` message. No bearer tokens
  appear in any response body.

Still pending and to be confirmed live with a valid `ADMIN_HOSPITAL` session:

- `403` for an admin of a different hospital (expected `exigirAdminHospital`).
- Exact shape and message of the backend `400` for `desde` > `hasta`.
- The maximum admissible range extension (ceiling).
- `serieDiaria` coverage of the inclusive range with zero-patient days.

Response schema (`MetricasHospitalResponse`; all fields optional in the
generated contract, treated as absent = "-" in the UI):

- `hospitalId` (`int64`), `desde`, `hasta` (`date`).
- Queue and attention KPIs: `ingresaronACola`, `pacientesAtendidos`,
  `pacientesNoAtendidos` (`int64`).
- `esperaPromedioMinutos` (`double`); absent when the period had no
  attentions — the UI shows "-" instead of a fabricated number.
- `porcentajeAtendidos` (`double`).
- `distribucionGravedadBot[]` and `distribucionGravedadMedico[]` of
  `DistribucionNivelItem { nivel: string, cantidad: int64, porcentaje: double }`.
  The bot distribution includes `SIN_CLASIFICACION_IA` for queue entries without a
  valid completed AI result; the doctor distribution additionally reports `SIN_REVISION`.
- `pretriageRealizado`, `pretriageNoRealizado` (`int64`) and
  `porcentajePretriageRealizado` (`double`).
- `serieDiaria[]` of `SerieDiariaItem { fecha: date, ingresados: int64,
  atendidos: int64, esperaPromedioMinutos: double }`.


The running backend, its source, and the exported OpenAPI are authoritative. Do not pin frontend work to a backend commit and never invent missing contracts.

## Refresh the snapshot

With the backend running locally:

```powershell
New-Item -ItemType Directory -Force -Path contracts | Out-Null
Invoke-WebRequest -UseBasicParsing `
  -Uri http://localhost:8080/v3/api-docs `
  -OutFile contracts/pretriage-openapi.json
```

Validate that the file parses as JSON before generating transport types.

## Delivery order

1. Authentication, identity probes, API errors, and privacy-safe logging.
2. Reception bootstrap and active-session recovery.
3. Patient lookup/creation and admission creation.
4. Reception triage draft, finalization, cancellation, and result recovery.
5. Backend-supported doctor session and queue actions.
6. Doctor recovery, clinical detail, and priority validation after contracts exist.
7. Contract tests, E2E, accessibility, and visual regression.

## Authentication and identity

- `POST /api/login` and `POST /api/register` are public.
- `POST /api/renovar` is public and accepts `{ refreshToken }`. Login and renewal
  return `{ token, refreshToken, renovarTokenEn }`, where `renovarTokenEn` is the
  access-token lifetime in seconds. Refresh rotation invalidates the previous
  refresh token, so the web must replace both HttpOnly cookies on every success;
  an invalid or expired refresh returns `401` and ends the local session.
- Password recovery is public and uses the following backend endpoints:
  `POST /api/auth/cambio-contrasenia/solicitar-token`,
  `GET /api/auth/cambio-contrasenia/validar?token=...`, and
  `POST /api/auth/cambio-contrasenia`.
- All staff workflow endpoints require an issuer-validated bearer JWT.
- The backend identifies the caller through the JWT `sub` and resolves the corresponding `Recepcionista` or `Medico` in its own database.
- Spring Security currently requires authentication globally but does not authorize staff routes from JWT role claims. Role and ownership checks happen in the service layer through the authenticated subject.
- The provisional frontend calls backend `POST /api/login` through a server-side
  Next.js route and stores access and refresh tokens in separate HttpOnly cookies.
  The Next proxy renews through `/api/renovar` before protected requests when the
  access token is within 60 seconds of expiry.
- This Password Realm contract still requires production hardening. The migration
  requirements are recorded in `docs/authentication-hardening-plan.md`.
- Tokens must never be written to localStorage, logs, analytics, or URLs.

The token request accepts `email` and always returns a generic message to avoid
account enumeration. Its current response fields are `mensaje` and
`tiempoExpiracion` (a `LocalTime` duration such as `00:15:00`). A new request
invalidates prior pending tokens, and the backend limits known accounts to three
requests per hour. Validation returns `valido: true` for a pending, unexpired
token; invalid, expired, or already-used tokens return `400`. Password change
accepts only `token` and `nuevaContrasenia` and consumes the token after success.
The web adds password confirmation locally and never sends it to the backend.

### Authenticated staff password change

H0019 uses `POST /api/auth/cambio-contrasenia/actual` with a bearer JWT
(`CambiarContraseniaAutenticadaRequest`: `contraseniaActual` and
`contraseniaNueva`, both required non-empty strings). The staff web never calls
it from the browser: `POST /api/staff/account/password` validates both fields
with Zod (non-empty, at most 256 characters), forwards them with the session
bearer, and returns the backend payload. Its responses are `no-store` and
passwords are never logged, stored, or added to a URL.

Web behavior and real error shapes:

- `200`: the backend returns a field map such as `{ message: "..." }`. The BFF
  clears the access, refresh, and renewal cookies in the same response, so the
  refresh token is no longer available to the browser. The UI then replaces the
  history entry with `/login?cambio=exito`, where the login page shows the
  success notice and asks for the new password.
- `400`: service errors use `{ error }` (wrong current password, new password
  equal to the current one, or an Auth0 rejection). Bean Validation errors use
  a field map such as `{ contraseniaNueva: "La contraseña debe..." }`; the shared
  transport surfaces the first string value instead of the generic fallback.
  The form stays usable and only clears the current-password field.
- `423`: `{ error }` with the active lock and remaining minutes. The form shows
  the message and disables its inputs and submit for that view. A page reload
  re-enables the form visually, but the backend still answers `423` until the
  lock expires.
- `401`: the BFF also clears the session cookies before responding, and the UI
  navigates to `/login`.

Rules mirrored by the browser before consuming an attempt: 8–32 Unicode code
points, at least one uppercase letter (`\p{Lu}`), one lowercase letter
(`\p{Ll}`), one digit (`\p{Nd}`) or special character (anything that is not a
letter, digit, or Java ASCII whitespace), and different from the current
password. The backend remains the authority.

Attempts and the 3-failure/24-hour lock are backend-owned. The attempt that
reaches the limit returns `400` while already setting the lock; the next attempt
returns `423`, and the client does not infer or count attempts locally.
Successful changes discard the local cookies but do not revoke the Auth0 grant:
the backend has no logout/revocation endpoint, so an already exfiltrated refresh
token could remain valid until expiry or rotation. This is a documented
limitation, not a blocker for H0019.

## Reception contract

The current backend supports the complete assisted-admission lifecycle:

```http
GET  /api/recepcion/hospitales
GET  /api/recepcion/sesiones/activa
POST /api/recepcion/sesiones
POST /api/recepcion/sesiones/{sesionId}/cerrar
GET  /api/recepcion/pacientes/{dni}?sesionId={sesionId}
GET  /api/recepcion/admisiones?sesionId={sesionId}
POST /api/recepcion/admisiones
GET  /api/recepcion/admisiones/{admisionId}
PUT  /api/recepcion/admisiones/{admisionId}/cobertura
POST /api/recepcion/admisiones/{admisionId}/finalizar
POST /api/recepcion/admisiones/{admisionId}/cancelar
GET  /api/pacientes/{pacienteId}/obrasocial/credenciales
POST /api/pacientes/{pacienteId}/obrasocial/credencial
PUT  /api/pacientes/{pacienteId}/obrasocial/credenciales/{credencialId}
```

Rules relevant to the frontend:

- A receptionist can have only one active session.
- Hospitals are limited to assignments for the authenticated receptionist.
- DNI is normalized to digits and must contain seven or eight digits.
- An existing patient is reused by DNI; otherwise the admission request creates a reception-origin patient.
- The form preloads stored demographics and address from lookup. It displays birth dates as
  `DD/MM/YYYY` and sends ISO. The date must be before today and no more than 120 calendar years
  in the past using Argentina's local date. An admission saves the verified values for existing
  patients too. Contact email and postal code are optional and can be cleared explicitly.
- The address form displays «Barrio» for Ciudad Autónoma de Buenos Aires and «Localidad» for
  other provinces. Both use the API field `ciudad`.
- A patient cannot have another active consultation.
- Patient lookup returns `atencionEnCurso` and `estadoAtencionEnCurso`. The web stays on the
  DNI search when there is an active attention. If creation returns a conflict, the web
  checks lookup again to surface the latest attention state.
- Specialty starts blank for every admission and must belong to the session hospital.
- After admission creation, reception can add or edit a credential and choose which one
  applies. The web sends `{ credencialId }` to the admission coverage endpoint, using `null`
  for no coverage. `coberturaConfirmada` and `cobertura` from the admission list distinguish
  a pending choice from a confirmed choice on resume. Coverage data is not persisted in
  browser storage.
- A credential requires `nombreObraSocial`, a 6-20 digit `numeroAfiliado`, an
  alphanumeric `plan`, and a `fechaVencimiento` in ISO date format. In reception, expiration
  must be after today for creation, edits, and selection. The UI displays `DD/MM/YYYY`.
- The receptionist completes one structured clinical form. `motivoConsulta` is
  the required patient-language main complaint; `sintomas` contains only
  optional additional symptoms. Pain is a repeatable `dolores` list with one
  location and 0-10 intensity per entry.
- The backend generates priority; reception cannot submit or modify it.
- Open admissions can be listed, resumed from their metadata, or cancelled.
- Finalized and cancelled admissions are terminal.
- A reception session cannot close while it owns an unfinished admission.
- Finalization returns the anonymous call code, generated priority, and dynamic estimate.
- The current estimator populates `fechaHoraAtencionEstimada`. Reception also
  accepts the optional `fechaHoraAtencionEstimadaDesde/Hasta` range and prefers
  it when the backend provides it.
- Admission detail intentionally omits the stored clinical form and raw triage JSON.

Only reception triage drafts may use `sessionStorage`, keyed by admission ID. Clear the draft after successful finalization or cancellation.

Reception finalization may invoke the backend AI provider. The backend bounds that provider call and falls back to its deterministic classifier when the provider is unavailable. As a final guard, the frontend BFF aborts backend calls after 60 seconds and returns a retryable `504`; the admission draft remains in `sessionStorage`, so the receptionist can retry without re-entering symptoms.

## Doctor contract currently available

```http
GET  /api/medico/asignaciones
GET  /api/hospitales/{hospitalId}/sectores?codigoEspecialidad={codigo}
GET  /api/hospitales/{hospitalId}/sectores/{sectorId}/salas?codigoEspecialidad={codigo}
GET  /api/medico/sesiones/actual
POST /api/medico/sesiones
POST /api/medico/sesiones/{sesionId}/pausar
POST /api/medico/sesiones/{sesionId}/reanudar
POST /api/medico/sesiones/{sesionId}/cerrar
GET  /api/medico/sesiones/{sesionId}/pacientes-disponibles
POST /api/medico/sesiones/{sesionId}/llamar-proximo
POST /api/medico/sesiones/{sesionId}/consultas/{consultaId}/presente
POST /api/medico/sesiones/{sesionId}/consultas/{consultaId}/ausente
GET  /api/medico/sesiones/{sesionId}/consultas/{consultaId}/pretriaje
PUT  /api/medico/sesiones/{sesionId}/consultas/{consultaId}/revision-prioridad
POST /api/medico/sesiones/{sesionId}/consultas/{consultaId}/finalizar
GET  /api/medico/atenciones
```

The API supports the complete planned medical-session flow. During `EN_ATENCION`, the frontend retrieves the normalized pretriage summary and requires the doctor to review priority before finalization. `CONFIRMAR` is one click. `CORREGIR` requires a different priority and accepts an optional reason of at most 500 characters. A genuine change is audited; an identical retry is idempotent. The review can be changed while attention remains open, and finalization is rejected with `409` while it is pending.

The consultation-scoped pretriage response includes `estadoClasificacion`,
`cierreParcial` and `mensajesConversacion`. For a `PARCIAL` closure without a
valid AI result, the web shows the literal conversation in the same in-attention
consultation view and marks the initial queue priority as provisional. The
existing priority review flow remains available; the patient is not assigned a
second consultation or queue entry.

The doctor selects an assigned specialty, an active hospital sector and an active
room in that sector before starting a session. Sector and room lists are filtered
by hospital and specialty. `POST /api/medico/sesiones` requires
`{ hospitalId, codigoEspecialidad, sectorId, salaId }`; the backend validates
that the sector and room are active and belong to the selected hospital and
specialty. The exported OpenAPI snapshot includes these sector-scoped routes and
the required `sectorId` session field; the backend controller remains authoritative.

## Doctor blockers

The confirmed product flow also requires the following contracts, which are not present in the current OpenAPI:

- Return explicit backend-owned relative-order and wait-time fields for each queue row. Priority, patient name, surname and calling code are available to the authorized doctor; the frontend never recalculates queue order.
- Define whether notes and vital signs belong to this release; no request DTO currently accepts them.
- Define typed `404` and `409` error bodies for recovery and concurrency cases. The OpenAPI currently documents statuses but not a shared error schema.

`ConsultaLlamadaDTO` remains a compact queue/call projection. Clinical detail and priority review intentionally use their own consultation-scoped contract.

## Pending frontend contract work

- Generate a transport client from `contracts/pretriage-openapi.json`; TypeScript
  schema types are already generated by `npm run contracts:generate`.
- Add a contract sync/check command so CI detects drift from the running backend export.
- Replace the provisional backend-login session according to `docs/authentication-hardening-plan.md`.
- Keep doctor UI limited to backend-supported behavior until the blocker contracts above are implemented.

## Staff membership contract

The backend now exposes `/api/staff/me` and hospital-scoped membership/invitation
administration. The frontend no longer infers one global role by probing reception
and medicine endpoints. See `docs/staff-access-and-invitations-plan.md` for routes,
implemented scope and the remaining Universal Login/mail hardening work.

After login, one active membership redirects directly to its primary module; several
memberships show only a hospital selector. Roles are capabilities in the shared
hospital navigation rather than a second workspace choice.

Invitation administration additionally supports:

```http
POST /api/admin/hospitales/{hospitalId}/invitaciones/{invitacionId}/reenviar
GET  /api/platform/hospitales
```

Reissuing rotates the token and expiry. In local adapter mode the authorized admin
receives `tokenEntregaUnica`; in SMTP mode it is always null. Delivery attempts are
reported through `emailEnviado`, `ultimoIntentoEnvio` and
`cantidadIntentosEnvio`. Persistent outbox processing and Universal Login remain
production-hardening work.

For a new account, `POST /api/invitaciones/{token}/registro` requires a password
between 8 and 72 characters containing uppercase, lowercase, numeric and symbol
characters. Password confirmation is a frontend-only check and is never sent to or
stored by the backend.

Registration is retry-safe when Auth0 contains the invited identity but the local
account was not persisted: the backend validates the submitted credentials, reuses
the Auth0 subject and completes the local account. Document conflicts are rejected
before creating the external identity.

Hospital administration also includes medical coordination. The former
`COORDINADOR_MEDICO` value was removed from the public contract and existing data is
converted to `ADMIN_HOSPITAL` during backend startup.

Hospital administrators manage the specialties offered by their hospital and its
rooms through:

```http
GET    /api/admin/hospitales/{hospitalId}/configuracion
POST   /api/admin/hospitales/{hospitalId}/configuracion/especialidades/{especialidadId}
DELETE /api/admin/hospitales/{hospitalId}/configuracion/especialidades/{especialidadId}
POST   /api/admin/hospitales/{hospitalId}/configuracion/sectores
PUT    /api/admin/hospitales/{hospitalId}/configuracion/sectores/{sectorId}
DELETE /api/admin/hospitales/{hospitalId}/configuracion/sectores/{sectorId}
POST   /api/admin/hospitales/{hospitalId}/configuracion/sectores/{sectorId}/salas
PUT    /api/admin/hospitales/{hospitalId}/configuracion/sectores/{sectorId}/salas/{salaId}
PATCH  /api/admin/hospitales/{hospitalId}/configuracion/sectores/{sectorId}/salas/{salaId}/estado
GET    /api/admin/hospitales/{hospitalId}/configuracion/sectores/{sectorId}/sesiones
POST   /api/admin/hospitales/{hospitalId}/configuracion/sectores/{sectorId}/sesiones/{sesionId}/cerrar
```

Specialties remain a global catalog: hospital administration only enables or
disables an association. Room operations require a sector owned by that hospital;
updates cannot move a room to another sector. Individual rooms support activation
and deactivation, while deleting a sector also deletes its rooms.

### Sector administration (source reviewed 2026-09-21)

Verified against `HospitalConfigurationController`, `HospitalConfigurationDtos`,
`HospitalConfigurationService` and its focused service tests in the local backend.
All configuration operations require `exigirAdminHospital` for the selected hospital.

- Configuration returns `especialidades`, `salas` and `sectores`.
- A sector has `id`, `nombre`, `activa`, `especialidadId`,
  `especialidadCodigo` and `especialidadNombre`.
- Creating a sector accepts `{ nombre, especialidadId }` and creates it active.
  Updating accepts `{ nombre, especialidadId, activa }` (all required).
  Names are trimmed, required, at most 100 characters and unique ignoring case
  within the hospital. The specialty must be enabled in that hospital.
- Room responses additionally include nullable `sectorId` and `sectorNombre`.
  Room creation/update still accepts only `{ nombre, especialidadId }`; the sector
  is in the path. The specialty must match the sector, and room names are unique
  ignoring case within the sector. State changes accept `{ activa }`.
- Editing a sector is rejected if its rooms have patients with nonterminal
  consultations. Saving `activa: false` deactivates all its rooms. Reactivating a
  sector does not reactivate those rooms.
- Deletion also rejects active or paused medical sessions in its rooms. A successful
  deletion removes the sector and its rooms and returns `204`.
- Manageable sector sessions include `id`, `medicoId`, `medicoNombre`, `estado`,
  `sectorId`, `sectorNombre`, `salaId`, `salaNombre`, `codigoEspecialidad`,
  `nombreEspecialidad` and `fechaHoraInicio`. The list includes only active or paused sessions (`ACTIVA`/`PAUSADA`)
  and returns an empty array when neither exists in the sector.
  `salaId` and `salaNombre` are nullable; the UI labels a missing room as
  “Sin consultorio”.
- Finalizing a session accepts no request body and returns the updated session DTO
  with `estado: FINALIZADA`. The operation releases the room while retaining session
  history in the database; the sector-session listing does not expose that finalized
  history. A `409` conflict is surfaced in the confirmation dialog, which remains
  open so the administrator can read the backend reason. Paused sessions are not offered
  as a separate pause action because pausing does not release the room.
- The web groups rooms under sectors, derives room specialty from the sector,
  confirms destructive deletion, disables configuration actions while pending and
  refetches configuration/audit after both successful and failed mutations.
  Unassigned legacy rooms are displayed read-only; there is no reassignment route.

Current backend contract limitations (not changed by this frontend integration):

- Changing a sector's specialty does not update its existing rooms. The web shows
  mismatches and uses the sector specialty on the next room save; it does not assume
  an automatic bulk migration.
- Room creation/activation does not reject inactive sectors. The UI displays that
  an inactive sector does not receive new patients rather than inventing a server
  transition restriction.
- Admin configuration uses explicit source-verified types in
  `features/admin/hospital-configuration.ts`; generated files are refreshed with
  `npm run contracts:generate`, not edited by hand.

### Hospital-wide specialty deactivation

Deactivation uses `DELETE /api/admin/hospitales/{hospitalId}/configuracion/especialidades/{especialidadId}`.
No sector ID is accepted by the web workflow or required by the backend route.
The backend checks active rooms of this specialty across the entire hospital,
including rooms without a sector, before removing the hospital-specialty association.
A hospital with no sectors can deactivate an unused specialty. Rooms belonging to
other specialties or hospitals do not block it. The global specialty catalog and
existing sectors/rooms remain intact, and the specialty can be enabled again.
The sector-scoped specialty DELETE route is no longer supported.

The web sends only `hospitalId` and `specialtyId` with `operation: "disableSpecialty"`,
keeps actions disabled until authoritative state is refreshed, and displays the
backend's conflict message without removing the specialty optimistically.
