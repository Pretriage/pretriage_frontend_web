# Local development

Requirements: Node.js 20+, npm, and the backend at http://localhost:8080.

## Start

1. Copy .env.example to .env.local.
2. Run npm install.
3. Run npm run dev.
4. Open http://localhost:3000.

## Architecture

- app/: routes, layouts, boundaries, and route-local UI.
- components/: shared UI and providers.
- features/: workflows, adapters, schemas, and queries.
- lib/api/: privacy-safe transport and normalized errors.
- contracts/: OpenAPI snapshot and generated transport code.
- middleware.ts: protected-route guard and server-side access-token renewal (Node.js runtime).
- app/api/staff/: privacy-safe BFF routes. Browser code never receives bearer tokens.
- app/api/auth/: provisional login/logout against the backend.

Reception and doctor sessions recover their authoritative state from the backend after a reload.
An in-attention doctor workspace also refetches the pretriage summary and priority-review state. Finalization stays disabled until that backend-owned review is confirmed or corrected.

Verification: npm run test:contracts, npm run typecheck, npm run lint, npm run build.
Never commit credentials, tokens, or real patient data.

## Continuous integration

GitHub Actions runs `.github/workflows/ci.yml` for pull requests and pushes to
`desarrollo` and `main`. The `Frontend CI / verify` check installs the locked
dependencies with `npm ci`, then runs contract tests, typecheck, lint, and the production build.

Configure `Frontend CI / verify` as a required status check in the branch
protection rules for `desarrollo` and `main` so a pull request cannot merge while
the check is pending or failing.

## Staff access development

After login, `/api/staff/me` resolves all active hospital workspaces. Existing
reception/doctor records are migrated lazily by the backend. Hospital admins use
`/admin/hospital`; invitation acceptance uses
`/invitaciones/aceptar#<one-time-secret>`. The fragment is removed from browser
history as soon as the page loads and is never persisted by the frontend.

The backend uses `LocalInvitationEmailAdapter` by default and returns the invitation
secret once for local handoff. SMTP mode sends the fragment link and never exposes
the secret in the administrative response. Do not paste invitation secrets into
issue trackers, logs or committed files.

The staff invitation form groups email, additive role permissions and conditional
medical credentials. Medical specialties come from the hospital's enabled catalog,
not manually entered IDs. Inline errors preserve the draft; submission remains
blocked through mutation and authoritative refetch. Delivery feedback distinguishes
sent mail, a one-time local secret, and delivery still pending.

Hospital administration sidebar entries are real in-page links to invitation
creation, configuration, personnel, invitations and audit. Fragment links preserve
the hospital query parameter and unsent form values; the selected destination is
marked with `aria-current="location"`. There is no placeholder “Inicio” entry.
Headings accept keyboard focus and leave space for the sticky navigation on mobile.

`/admin/hospital/metricas` is its own route for hospital metrics. Its sidebar
keeps the same conventions: a real "Métricas" link renders inside the
administration sidebar on `/admin/hospital`, and the metrics page shows a
section navigation with a "Administración" back link plus in-page anchors
(Resumen, Distribuciones, Serie diaria) marked with
`aria-current="location"` while the corresponding hash is active. The page
requires the `ADMIN_HOSPITAL` membership of the requested `hospitalId`;
without `hospitalId` it shows a "choose your hospital" message instead of
redirecting.

## Hospital metrics view

Admins open `app/admin/hospital/metricas/page.tsx`. The panel in
`features/admin/hospital-metrics-panel.tsx` queries the reading BFF
`GET /api/staff/admin/metricas?hospitalId&desde&hasta` (route
`app/api/staff/admin/metricas/route.ts`), which forwards server-side with the
session token to `/api/admin/hospitales/{hospitalId}/metricas`. The browser
never receives bearer tokens. Query state lives in the URL
(`?hospitalId&desde&hasta`): a fresh load shows the empty state without
calling the backend; reloading persists the range and preloads the form;
ranges with `hasta = today` refetch hourly while the page stays open and
closed ranges are cached. Date rules (`desde` < today, `hasta` <= today,
`hasta` >= `desde`) are validated in the form and for URL parameters, showing
inline errors under each field without querying. Backend business-rule
rejections surface as a dismissible-free `notice-error` with the backend's
message. Metric levels come from the shared module `lib/severity.ts` (also
used by reception and doctor workspaces). Distribution bars use the solid
severity palette via `metrics-fill`; the priority chips in reception and doctor
keep their soft backgrounds.
The bot distribution has a separate `SIN_CLASIFICACION_IA` row for queue entries
without a valid completed AI result, including partial interviews. The provisional
queue priority is not presented as an AI severity result; operational totals and
the doctor severity distribution continue to include every queue arrival.

Distribuciones and Serie diaria each have an independent
`Cambiar vista a vertical` / `Cambiar vista a horizontal` control. The initial
view is horizontal, with the accessible table and horizontal bars. The vertical
view removes the table and renders an interactive column chart: each
distribution bar and each day group is a button with `aria-pressed`, its
accessible name includes the associated values, and a persistent `aria-live`
detail panel shows severity/cases/percentage or
date/ingresados/atendidos/espera. Selecting the same bar again clears the
selection and the initial instruction reappears. Orientation is local state:
switching views does not change the URL or refetch metrics, each section toggles
on its own, the chosen orientation survives a new query, and the charts remount
on a range change so any previous selection is cleared. Long series scroll
horizontally; the empty series hides the orientation control.

Verify with `npm run dev` and a valid `ADMIN_HOSPITAL` account: open
`/admin/hospital/metricas` (message without `hospitalId`, redirect for a
foreign `hospitalId`), consult a first range with data, reload the URL and
check the form preload, enter `desde = today` or an inverted range and check
the inline errors, and confirm `npm run typecheck`, `npm run lint`,
`npm run build` pass. For the graph views, toggle each section independently
and confirm the URL and the Network panel show no new request, toggle back,
select a distribution bar and a day group with mouse and keyboard (Enter or
Space), reselect to clear the detail, check a zero level and a zero-value day,
an empty series, a long range with horizontal scroll, and the mobile layout.
See `docs/backend-contract.md` for the live backend checks still pending.


The shared staff header shows “Cambiar hospital” only when `/api/staff/me` returns
more than one distinct active hospital with an available staff module. Multiple
roles in the same hospital do not enable this action. The admin heading has no
duplicate “Cambiar espacio” link. Module navigation remains available within the
current hospital.

Administrators can review active or paused sessions from each sector card,
including inactive sectors. Finalized history remains in the backend database and
is not returned by this listing. Active and paused sessions can be
finalized after confirmation; the room is released and the session remains in
history. A 409 response keeps the confirmation open and shows the backend reason.
Closing a session does not enable physical sector deletion; if a sector has
history, deactivate it to stop using it. Session changes refresh that sector's
sessions, hospital configuration and audit, and doctor data.

## Provisional authentication

The login page sends credentials to the server-side route
`POST /api/auth/login`. That route calls backend `POST /api/login` and
stores the returned access token, rotating refresh token, and backend-provided
renewal time in HttpOnly, SameSite=Lax session cookies. Browser JavaScript never
receives the tokens and credentials are not persisted.

Protected screens check the session with `POST /api/auth/sesion` on mount, every
30 seconds while open, and when the page regains focus, becomes visible, is
restored from the browser history, or reconnects. The middleware calls backend
`POST /api/renovar` when the check is within 60 seconds of expiry. Other protected
requests use their current access token until it expires, then can recover through
the same renewal flow. Each rotation replaces all three HttpOnly cookies.

The browser serializes checks with logout and password changes across tabs when
Web Locks are available, or within the current tab otherwise. Concurrent server
requests with the same refresh token share an in-flight renewal within a single
middleware runtime. After a successful rotation that runtime keeps only the old
token's digest for two seconds, so late requests retry with the browser's updated
cookies. The rotated credentials are released once the operation completes.
A transient renewal failure keeps the cookies and the browser retries after 10
seconds. An invalid refresh clears the session and sends the user to login.

The public `/restablecer-contrasena` flow uses the server-side
`POST /api/auth/password-reset` BFF for token request, validation, and password
change. The one-time token and passwords remain only in component memory while
the page is open; they are never stored in browser storage or added to a URL.

## Staff profile and password change

`/cuenta/perfil` is a protected page available from the Perfil link in the staff
and platform admin headers and the workspace selector. It uses the staff
layout and preserves the originating module and hospital when the current
memberships allow it. It reads the signed-in staff account via
`GET /api/staff/me`. The profile form can change the account
first and last names through `PUT /api/staff/account/profile`, which forwards to
`PUT /api/staff/me`. The sign-in email is displayed as read-only. Staff headers
display the saved name from staff context.

The password form is on the same page. The former `/cuenta/contrasena` route
redirects to that section. It asks for the current password, the new password,
and its repetition. The client mirrors the backend strength rules (8–32 code
points, uppercase, lowercase, digit or special, different from the current one)
and blocks submission before consuming an attempt. The three-attempt/24-hour
lock notice is always visible.

The form sends `{ contraseniaActual, contraseniaNueva }` to
`POST /api/staff/account/password`, which forwards to backend
`POST /api/auth/cambio-contrasenia/actual` with the session bearer. Passwords
stay in memory: they are never written to storage, URLs, logs, or analytics. On
success the BFF clears the access, refresh, and renewal cookies in the same
response and the client replaces the history entry with
`/login?cambio=exito`, where login shows the success notice. A `423` disables
the form for the current view; a `401` clears the session and redirects. See
`docs/backend-contract.md` for the error shapes and the Auth0 revocation
limitation.

This remains an explicitly temporary Password Realm integration. See
`docs/authentication-hardening-plan.md` before considering it production-ready.

## Hospital sectors and rooms

Hospital administrators use `/admin/hospital` to enable specialties, create/edit
sectors (name, specialty and active state), and manage rooms grouped under each
sector. Doctors select an assigned specialty, an active sector and an active room
in that sector before starting a session. Room specialty follows the selected sector. Deactivating a sector also
deactivates its rooms; deleting one requires confirmation because its rooms are
deleted as well. Mutations use `/api/staff/admin` and reload authoritative
configuration and audit through TanStack Query. Use a backend with the
sector-scoped session contract documented in `docs/backend-contract.md`.

Creating a sector first opens a confirmation dialog with its name and specialty.
Enabling a hospital specialty also requires confirmation showing its name; cancel
or Escape sends no request. Both flows share pending/error handling and restore
keyboard focus after closing.
Cancel/Escape preserves the draft without sending a request. Confirmation stays
open during the mutation and refetch; an error allows correction or retry. See
`docs/admin-ux-plan.md` for the UX decisions and browser acceptance cases.

Use a backend with the sector-scoped configuration contract documented in
`docs/backend-contract.md`. The old `/configuracion/salas` paths are no longer used.
Verify with synthetic hospital data: empty sectors, creation, duplicate-name and
patient/session conflicts, editing specialty/state, room creation/rename/state,
deletion cancellation and successful deletion, then reload the page. Check that
errors preserve form entries, pending controls cannot submit twice, and sector
deactivation refreshes every affected room. Specialty deactivation must work without
any sectors and must reject active rooms of that specialty anywhere in the hospital;
the form must not request a sector.

## Contract refresh

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Uri http://localhost:8080/v3/api-docs `
  -OutFile contracts/pretriage-openapi.json
npm run contracts:generate
```

## Argentine locations catalog

Reception address fields use the bundled official Georef catalog. The dependent
field starts as «Localidad o barrio», becomes «Barrio» for Ciudad Autónoma de
Buenos Aires and becomes «Localidad» for other provinces. Runtime form use does
not call an external service or transmit address fragments. Refresh the snapshot
when territorial data changes:

```powershell
npm run georef:update
```

The generated `lib/geo/argentina-locations.json` must be committed together with
the update script. Its source is the public Georef API from Argentina's national
open-data service.

Staff web forms mark required fields and groups with an asterisk and explain the
marker near the form. Optional fields have plain labels. For optional sections
with their own validation, the required marks apply when the user adds the data,
such as a coverage credential.

## Shared form controls

Single-choice dropdowns use `SearchableCombobox`, the searchable Province control.
The options can display labels while retaining the IDs or codes sent to the API.
Existing fields that accept free text opt in explicitly.

`DatePicker` always shows `DD/MM/AAAA` for birth dates and metrics ranges.
It accepts typing with automatic separators and opens a compact DayPicker next
to the field. Months, weekdays and navigation labels are in Spanish regardless
of browser locale. Credential expiration uses `MM/AAAA` with the same typing
behavior and a Spanish month and year selector. The forms validate the dates
and keep ISO values for the API. Dates shown in lists
also use `DD/MM/AAAA`. Instants are displayed in Argentina's time zone.

## Argentine health coverage plans

The reception form bundles published plan names for the 16 demo providers in
`features/reception/coverage-plans.ts`. The options are references from official
sources, including regional cartillas. Reception can enter another plan printed
on the credential. «Cobertura general» describes a provider's standard coverage
when it publishes no differentiated tiers.

| Provider | Source |
| --- | --- |
| OSDE | [Contracts by plan](https://www.osde.com.ar/conoce-osde/contrato-de-adhesion) |
| Swiss Medical | [SMG02](https://www.swissmedical.com.ar/smgnewsite/pag_internas/pdf/planes/SMG02.pdf), [SMG20](https://www.swissmedical.com.ar/smgnewsite/pag_internas/pdf/planes/SMG20.pdf), [SMG30](https://www.swissmedical.com.ar/smgnewsite/pag_internas/pdf/planes/SMG30.pdf), [annex of open plans](https://www.swissmedical.com.ar/smgnewsite/pag_internas/pdf/planes/S1261-ANEXOS-PLANES-ABIERTOS.pdf) |
| Galeno | [Published plan guide](https://www.galeno.com.ar/blog/planes-de-salud-galeno-opciones-flexibles-para-tu-bienestar/) |
| Medifé | [Cartillas by plan](https://www.medife.com.ar/mapa-cartilla-pdf) |
| Omint | [Cartillas by plan](https://www.omint.com.ar/Website2/Default.aspx?tabid=1500&texto=cartilla+medica) |
| SanCor Salud | [2024–2025 report, p. 37](https://repo.sancorsalud.com.ar/webinstitucional/reportes/Reporte_2025/Reporte_2025.pdf) |
| Accord Salud | [Plan selector](https://gestion.accordsalud.com.ar/cartilla) |
| Unión Personal | [Plan selector](https://gestion.unionpersonal.com.ar/cartilla) |
| OSECAC | [PMO coverage](https://www.osecac.org.ar/ARCHIVOS/ANEXO_I.PDF) |
| OSDEPYM | [Plan table](https://www.osdepym.com.ar/files/portal/coseguros.pdf) |
| OSPE | [GBA Zona Sur plans](https://www.ospesalud.com.ar/wp-content/uploads/2026/10/GBA-Zona-Sur-RG.pdf) |
| OSUTHGRA | [PMO coverage](https://osuthgra.org.ar/consultorios/) |
| OSPERYH | [Programa Médico](https://osperyh.org.ar/cartilla-medica/) |
| IOMA | [Coverage guide, § 1.8](https://www.ioma.gba.gob.ar/wp-content/uploads/2022/02/Gu%C3%ADa-de-tr%C3%A1mites-para-trabajadoras-es3.pdf) |
| PAMI | [Affiliation and coverage](https://www.pami.org.ar/preguntas-frecuentes) |
| DOSUBA | [Tipo de Plan selector](https://cartilla.dosuba.uba.ar/) |

## Integration verification

See [the October 25 integration record](integration-2026-10-25.md) for the development
merge, dependency patches, verified commands and the scope of the runtime smoke test.
