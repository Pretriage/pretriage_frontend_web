# Navegación por capacidades e invitaciones

Estado: decisión aprobada; implementación incremental en curso.

## Decisión

El rol hospitalario no es un modo de sesión ni una segunda elección posterior al
login. Una identidad posee membresías por hospital y cada membresía otorga un
conjunto aditivo de capacidades. El frontend muestra los módulos habilitados y el
backend vuelve a autorizar cada operación.

`ADMIN_HOSPITAL` incluye la coordinación médica y la configuración operativa del
hospital. No existe un rol separado de coordinador médico.

Después de autenticar:

1. Sin membresías activas se informa que aún no existe acceso hospitalario.
2. Con una membresía activa se ingresa automáticamente al hospital.
3. Con varias membresías se elige solamente el hospital.
4. Dentro del hospital, Recepción, Atención médica y Administración aparecen en la
   misma navegación según los roles de la membresía. La administración hospitalaria
   abre directamente Especialidades y salas y ofrece, en orden, Métricas, Invitar
   personal, Gestionar personal y Anular penalizaciones.
5. `ADMIN_HOSPITAL` combinado con un rol operativo no cambia la portada: se ingresa
   al módulo operativo y Administración queda disponible en el menú.
6. La administración de plataforma es global y permanece separada de las
   membresías hospitalarias.

La prioridad de portada es Recepción, Atención médica y Administración. Si en el
futuro una persona posee simultáneamente los dos roles operativos, podrá navegar
entre ambos sin volver a elegir una función.

## Rutas

```text
/                              bootstrap o selector de hospital
/recepcion?hospitalId={id}     módulo de recepción
/medico?hospitalId={id}        módulo médico
/admin/hospital?hospitalId={id} administración hospitalaria
/admin/plataforma              administración global
/invitaciones/aceptar#{token}  aceptación; el fragmento se elimina de inmediato
```

El `hospitalId` orienta la interfaz, pero nunca concede autoridad.
La raíz de administración abre la configuración; las antiguas rutas `inicio` y
`auditoria` redirigen allí y conservan `hospitalId`.

## Modelo de invitaciones

- Un administrador hospitalario invita personal y otros administradores solamente
  dentro de su hospital.
- Un administrador de plataforma invita al primer administrador de cada hospital.
- Una cuenta existente conserva su identidad y suma la membresía o roles al aceptar.
- Una cuenta nueva elige y confirma una contraseña de entre 8 y 72 caracteres,
  con mayúscula, minúscula, número y símbolo; PreTriage no genera ni envía
  contraseñas.
- El token es aleatorio, de un solo uso, expira y sólo se persiste como hash.
- Reenviar rota el token anterior y extiende la vigencia.
- En producción el token nunca forma parte de la respuesta administrativa.

## Ports and Adapters para correo

El servicio de aplicación depende de `InvitationEmailPort`. Infraestructura aporta
adapters intercambiables:

```text
StaffAccessService -> InvitationEmailPort
                         |-> LocalInvitationEmailAdapter
                         |-> SmtpInvitationEmailAdapter
```

`LocalInvitationEmailAdapter` no envía correo y permite entregar el secreto una sola
vez en desarrollo. `SmtpInvitationEmailAdapter` construye un enlace con el token en
el fragmento y entrega el mensaje. El adapter activo se configura por ambiente.

La entrega persistente con outbox es el siguiente endurecimiento operativo: evita
acoplar la transacción de membresías a la disponibilidad del proveedor y permite
reintentos observables. Hasta incorporar la outbox, un fallo SMTP deja la invitación
creada y permite reenviarla desde el panel.

## Seguridad posterior al entorno de desarrollo

- Authorization Code + PKCE y access tokens destinados al API.
- Universal Login para alta de cuentas nuevas.
- Correo verificado antes de aceptar.
- MFA obligatorio para administradores.
- Rate limiting de creación, reenvío y aceptación.
- Outbox persistente con estado y cantidad de intentos.
- No exponer secretos de invitación fuera del adapter local.

## Criterios de aceptación

- No existe una pantalla obligatoria de selección de función.
- Una persona con un hospital entra directamente a su módulo principal.
- Una persona con varios hospitales elige sólo hospital.
- Recepcionista administrador ve Recepción y Administración en una navegación única.
- Los links y controles no sustituyen la autorización del backend.
- Crear y reenviar invitaciones deshabilita la mutación mientras está pendiente.
- Una invitación enviada por SMTP no devuelve su token al frontend.
- El flujo local sigue siendo ejecutable sin configurar correo.

La suspensión y reactivación de membresías no se exponen todavía en el panel. El
backend conserva el estado para una etapa posterior, cuando todos los flujos
operativos autoricen exclusivamente mediante `MembresiaHospital`.
