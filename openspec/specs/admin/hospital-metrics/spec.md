# admin/hospital-metrics Specification

## Purpose

Permite al administrador de hospital consultar en cualquier momento las métricas operativas de su propio hospital -atención, colas, gravedad y pretriage- filtradas por un período de fechas, para identificar oportunidades de mejora.

## Requirements

### Requirement: Acceso restringido a las métricas del hospital propio

Un administrador con rol `ADMIN_HOSPITAL` DEBE (MUST) poder acceder a las métricas de su hospital en cualquier momento desde su sesión. El sistema DEBE resolver el hospital del contexto de membresía del staff autenticado y DEBE impedir que un admin consulte métricas de un hospital distinto al de su membresía, sin importar el valor en la URL. Cuando la ruta no trae `hospitalId`, el sistema DEBE (MUST) mostrar un mensaje claro que indique cómo seleccionar el hospital y no DEBE redirigir, sin realizar llamadas de métricas. El sistema no DEBE exponer métricas a usuarios sin rol `ADMIN_HOSPITAL` ni a sesiones sin identidad.

#### Scenario: Admin accede a las métricas de su hospital
- **WHEN** un usuario con membresía `ADMIN_HOSPITAL` sobre el hospital H abre `/admin/hospital/metricas`
- **THEN** se muestra el formulario de consulta de períodos y el estado inicial vacío. El panel lateral común marca **Métricas** como vista activa. Todos los resultados se muestran en esa vista.

#### Scenario: Consulta sin hospital indicado
- **WHEN** el admin abre `/admin/hospital/metricas` sin `hospitalId` en la URL
- **THEN** la vista muestra un mensaje claro de hospital faltante dentro del shell admin, con el camino para elegir el hospital (Administración), sin redirigir y sin llamar al endpoint de métricas

#### Scenario: Admin intenta un hospital ajeno
- **WHEN** el `hospitalId` de la URL no coincide con ninguna membresía `ADMIN_HOSPITAL` del usuario autenticado
- **THEN** el sistema redirige sin mostrar métricas de otro hospital y sin llamar al endpoint backend de métricas

#### Scenario: Sesión sin rol admin
- **WHEN** el `hospitalId` de la URL coincide con una membresía vigente pero la sesión del usuario no incluye el rol `ADMIN_HOSPITAL` para ese hospital
- **THEN** el sistema redirige sin presentar la vista ni los datos de métricas

#### Scenario: Sesión vencida
- **WHEN** el usuario no tiene sesión vigente al abrir la ruta
- **THEN** el guardia de sesión lo lleva al flujo de inicio de sesión antes de mostrar cualquier métrica

### Requirement: Consulta de métricas por período con calendario

El formulario DEBE ofrecer **Este mes**, **Mes anterior** y **Personalizado**.
**Este mes** consulta desde el primer día del mes hasta hoy. **Mes anterior**
consulta el mes calendario completo. **Personalizado** permite elegir
`desde` y `hasta`. Los rangos usan el calendario de Buenos Aires y cumplen
`desde <= hasta <= hoy`. Dos fechas iguales consultan un solo día.
Los errores aparecen debajo del campo correspondiente antes de consultar.
El backend valida el rango final. Mientras carga la consulta, el formulario
bloquea nuevos envíos. **Consultar** usa el estilo de acción primaria del sistema.

#### Scenario: Consulta de un rango válido
- **WHEN** el admin selecciona `desde` y `hasta` que cumplen las reglas y consulta
- **THEN** el sistema muestra las métricas del hospital para ese rango inclusive

#### Scenario: Acción primaria de consulta
- **WHEN** el admin visualiza el formulario de consulta
- **THEN** el botón Consultar se presenta como la acción primaria del sistema, con fondo azul y texto claro, consistente con el resto de la aplicación

#### Scenario: Fecha inicial en el futuro
- **WHEN** el admin selecciona `desde` posterior a hoy
- **THEN** el sistema impide la consulta e indica la regla en el campo correspondiente

#### Scenario: Fecha final en el futuro
- **WHEN** el admin selecciona `hasta` posterior a hoy
- **THEN** el sistema impide la consulta e indica la regla en el campo correspondiente

#### Scenario: Rango invertido
- **WHEN** el admin selecciona `hasta` anterior a `desde`
- **THEN** el sistema impide la consulta e indica la regla en los campos correspondientes

#### Scenario: Campos incompletos
- **WHEN** el admin consulta con `desde` o `hasta` vacíos
- **THEN** el sistema no envía la consulta e indica que ambas fechas son obligatorias

#### Scenario: Parámetros de URL inválidos
- **WHEN** la página se abre con `desde`/`hasta` en la URL que violan las reglas o están malformados
- **THEN** los errores se muestran en rojo debajo del campo correspondiente y no se consulta

#### Scenario: Backend rechaza la consulta
- **WHEN** la consulta cumplió las reglas del formulario pero el backend la rechaza
- **THEN** el sistema muestra el mensaje de error del backend como aviso, no inventa métricas y permite corregir el rango y reintentar

#### Scenario: Consulta reiterada durante pendiente
- **WHEN** el admin consulta y vuelve a enviar el formulario antes de obtener respuesta
- **THEN** todo el formulario queda bloqueado (botón y envío por Enter) mientras la consulta está pendiente

### Requirement: Estado de la consulta en la URL

La vista DEBE (MUST) iniciarse sin datos hasta que el admin realice una consulta. Al consultar, el sistema DEBE reflejar el rango consultado en los parámetros de la ruta (`desde` y `hasta`), preservando el `hospitalId` presente, y DEBE repetir automáticamente esa consulta al recargar la página con esos parámetros, presentando además el formulario precargado con ese rango. La primera carga sin parámetros DEBE permanecer vacía, sin llamar al endpoint con fechas inventadas.

#### Scenario: Carga limpia
- **WHEN** el admin abre la ruta sin parámetros de fechas
- **THEN** la vista se muestra vacía con la instrucción de consulta y no se realizan llamadas de métricas

#### Scenario: Recarga con consulta activa
- **WHEN** el admin recarga la página con `?desde=...&hasta=...` en la URL
- **THEN** el sistema repite automáticamente esa consulta, presenta el formulario precargado con ese rango y muestra sus métricas

### Requirement: Actualización periódica y estado de carga

Mientras corre la consulta inicial, la vista DEBE (MUST) mostrar un indicador de carga (spinner o mensaje) y mantener bloqueado el envío hasta recibir respuesta. Si el rango consultado incluye el día de hoy (`hasta` = hoy), el sistema DEBE reconsultar el mismo endpoint cada una hora mientras la vista permanezca abierta. Si el rango cerró en el pasado (`hasta` anterior a hoy), el resultado DEBE quedar cacheado y el sistema no DEBE reconsultarlo automáticamente. La reconsulta automática DEBE actualizar los datos en segundo plano sin vaciar la vista.

#### Scenario: Indicador durante la consulta inicial
- **WHEN** el admin consulta y el backend aún no respondió
- **THEN** la vista muestra el indicador de carga y el envío queda bloqueado hasta recibir respuesta

#### Scenario: Reconsulta horaria de rango que incluye hoy
- **WHEN** la consulta activa tiene `hasta` = hoy y la vista permanece abierta
- **THEN** el sistema reconsulta el endpoint cada una hora sin intervención del admin, actualizando los datos en segundo plano

#### Scenario: Rango cerrado queda cacheado
- **WHEN** la consulta activa tiene `hasta` anterior a hoy
- **THEN** el resultado queda cacheado y no se reconsulta automáticamente

### Requirement: Indicadores del período consultado

Para el rango consultado, el sistema DEBE (MUST) mostrar: la cantidad de pacientes que ingresaron a la cola, la cantidad atendidos, la cantidad no atendidos, el porcentaje de atención, el tiempo promedio de espera antes de ser atendidos, y la cantidad de pacientes que realizaron y no realizaron el pretriage junto con su porcentaje. El sistema DEBE tratar los valores nulos del backend como falta de dato: cuando la espera promedio reportada no tiene valor (período sin atenciones) la vista DEBE mostrar falta de dato y no un número inventado. Los porcentajes DEBEN (MUST) presentarse con un indicador visual circular (anillo) junto al número truncado a su parte entera, sin redondeo. El promedio de espera DEBE presentarse como número en tarjeta de KPI. Las fechas DEBEN formatearse en `dd/MM/yyyy`. Los conteos y promedios DEBEN usar la convención local `es-AR`.

#### Scenario: Período con datos completos
- **WHEN** el backend responde con todas las métricas del rango
- **THEN** la vista presenta los KPIs: ingresados a cola, atendidos, no atendidos, % de atención, espera promedio en minutos y pretriage realizado/no realizado con su porcentaje

#### Scenario: Período sin atenciones
- **WHEN** el backend reporta espera promedio sin valor
- **THEN** la vista muestra el estado vacío explícito ("-") en vez de un número inventado

#### Scenario: Formato local
- **WHEN** se renderizan porcentajes y promedios con decimales
- **THEN** el porcentaje se muestra truncado a la parte entera (70,0 se presenta "70") dentro de su anillo, el promedio se muestra con coma decimal (37,5) en tarjeta KPI y las fechas de la serie se presentan en `dd/MM/yyyy`

### Requirement: Distribución por gravedad

El sistema DEBE (MUST) mostrar la distribución de pacientes según nivel de gravedad en dos vistas: la asignada por una clasificación de IA completada (los cinco niveles de la tabla de Manchester) y la revisada por el médico, con sus conteos y porcentajes. Las entradas sin clasificación válida de IA DEBEN aparecer en la distribución del bot bajo `SIN_CLASIFICACION_IA`, al final; una prioridad provisional de cola no DEBE mostrarse como resultado de IA. La distribución del médico DEBE mostrar además los pacientes sin revisión (`SIN_REVISION`), que DEBE quedar siempre al final (última fila en la tabla o última barra en el gráfico) porque no es un nivel de gravedad. Los niveles fuera del catálogo conocido no DEBEN presentarse. Las categorías conocidas DEBEN mantenerse en orden de gravedad. Las barras DEBEN usar colores sólidos de la paleta de gravedad existente, con contraste suficiente sobre el fondo; no DEBEN reutilizar los fondos suaves de los chips de prioridad. En la vista horizontal, la distribución DEBE presentarse como tabla accesible con una barra horizontal por fila. En la vista vertical, DEBE presentarse como un gráfico de columnas interactivo sin tabla, donde cada barra DEBE ser seleccionable y mostrar el detalle definido en el requisito de selección de barras.

#### Scenario: Distribuciones presentes en vista horizontal
- **WHEN** el backend responde la distribución del período y la vista está en horizontal
- **THEN** la vista muestra la distribución del bot en tabla con sus cinco niveles en orden de gravedad y `SIN_CLASIFICACION_IA` al final, y la del médico con la fila `SIN_REVISION` al final, con sus conteos, porcentajes y barras horizontales

#### Scenario: Distribución en vista vertical
- **WHEN** el admin elige la vista vertical en Distribuciones
- **THEN** cada distribución se presenta como un gráfico de columnas por nivel, sin tabla, con barras seleccionables

#### Scenario: Colores sólidos de las barras
- **WHEN** la vista muestra las distribuciones en cualquier orientación
- **THEN** cada barra usa el color sólido de su nivel de gravedad, con contraste suficiente sobre el fondo, sin el fondo suave de los chips de prioridad

#### Scenario: Período sin pacientes en algún nivel
- **WHEN** un nivel no registra pacientes en el rango
- **THEN** la vista lo presenta con cantidad 0 y porcentaje 0, sin omitir el nivel del orden de gravedad y manteniendo su barra seleccionable en la vista vertical

#### Scenario: Nivel desconocido en la respuesta
- **WHEN** la distribución del backend incluye un nivel fuera del catálogo conocido
- **THEN** la vista lo omite de la tabla y de las barras sin inventar categoría ni bloquear el resto de la presentación

### Requirement: Serie diaria del período

El sistema DEBE (MUST) mostrar la serie diaria del rango consultado con ingresados, atendidos y espera promedio por día. Los días sin atenciones DEBEN representarse con su valor cero en conteos y falta de dato en espera. La serie DEBE cubrir ambos extremos del rango consultado (rango inclusivo). En la vista horizontal, la serie DEBE presentarse como tabla accesible con un par de barras horizontales por día. En la vista vertical, DEBE presentarse como un gráfico de columnas interactivo sin tabla, con dos barras por día (ingresados y atendidos) y un grupo seleccionable por día; al seleccionar cualquiera de sus barras se DEBEN mostrar fecha, ingresados, atendidos y espera promedio del día. Las etiquetas del eje y el detalle DEBEN mostrar la fecha completa en `dd/MM/yyyy`.

#### Scenario: Serie con días de datos y días vacíos en vista horizontal
- **WHEN** el backend responde la serie diaria de un rango que incluye días con y sin atenciones y la vista está en horizontal
- **THEN** la vista presenta cada día del rango en tabla con sus conteos, su par de barras y la espera promedio cuando existe, mostrando "-" los promedios ausentes

#### Scenario: Serie en vista vertical
- **WHEN** el admin elige la vista vertical en Serie diaria
- **THEN** la vista presenta un gráfico de columnas por día, sin tabla, con dos barras por día y etiquetas de fecha abreviadas

#### Scenario: Detalle de un día en la serie
- **WHEN** el admin selecciona cualquiera de las barras de un día en la vista vertical
- **THEN** el panel de detalle muestra la fecha completa, los ingresados, los atendidos y la espera promedio de ese día

#### Scenario: Serie sin días
- **WHEN** el backend no reporta días para el rango consultado
- **THEN** la vista muestra el mensaje de serie vacía y no ofrece la alternancia a la vista vertical

### Requirement: Comparabilidad entre períodos

Cada consulta DEBE (MUST) presentarse con la misma estructura de indicadores, distribuciones y serie diaria, de modo que el admin pueda comparar el funcionamiento del hospital entre distintos períodos realizando consultas sucesivas para rangos distintos.

#### Scenario: Consultas sucesivas de rangos distintos
- **WHEN** el admin consulta un rango A y luego cambia el rango y consulta un rango B
- **THEN** ambas presentaciones usan la misma estructura de la vista y la consulta más reciente reemplaza a la anterior

### Requirement: Alternancia de orientación de los gráficos

Cada sección de gráficos (Distribuciones y Serie diaria) DEBE (MUST) ofrecer un control propio para alternar entre la vista horizontal y la vertical. La vista inicial DEBE (MUST) ser horizontal. El control DEBE indicar la orientación de destino: `Cambiar vista a vertical` cuando la vista actual es horizontal y `Cambiar vista a horizontal` cuando es vertical. Las dos secciones DEBEN alternar de forma independiente. Alternar la orientación no DEBE (MUST NOT) modificar la URL, no DEBE disparar una nueva consulta al backend y no DEBE perder los datos ya consultados. La orientación elegida DEBE mantenerse al reconsultar mientras la página permanezca abierta. Al cambiar de orientación se DEBE limpiar la selección de barras.

#### Scenario: Vista inicial horizontal
- **WHEN** el admin obtiene métricas de un período
- **THEN** Distribuciones y Serie diaria se presentan inicialmente en la vista horizontal, con sus tablas y barras horizontales

#### Scenario: Cambio a vertical en una sección
- **WHEN** el admin activa el control de orientación de una sección
- **THEN** esa sección cambia a la vista vertical, el control pasa a indicar `Cambiar vista a horizontal` y la otra sección conserva su orientación

#### Scenario: Secciones independientes
- **WHEN** el admin cambia la orientación de Distribuciones y luego la de Serie diaria
- **THEN** cada sección conserva la orientación elegida de forma independiente

#### Scenario: Alternancia sin reconsulta
- **WHEN** el admin alterna la orientación de cualquiera de las secciones
- **THEN** no se modifica la URL, no se dispara una nueva consulta al backend y se conservan los datos ya consultados

#### Scenario: Conservación de orientación al consultar otro rango
- **WHEN** el admin consulta un rango nuevo sin recargar la página
- **THEN** cada sección mantiene la orientación elegida y se limpia la selección de barras

#### Scenario: Limpieza de selección al alternar
- **WHEN** el admin tiene una barra seleccionada y cambia la orientación de esa sección
- **THEN** la selección se limpia y la nueva vista se presenta sin detalle activo

### Requirement: Selección y detalle de barras en la vista vertical

En la vista vertical, cada barra de la distribución y cada grupo diario de la serie (con sus dos barras) DEBE (MUST) ser seleccionable con mouse y teclado. Sin una barra seleccionada, el sistema DEBE mostrar un mensaje visible que invite a seleccionar una barra para ver la información detallada. Al seleccionar una barra de distribución, el sistema DEBE mostrar gravedad, casos y porcentaje. Al seleccionar cualquiera de las barras de un día de la serie diaria, el sistema DEBE mostrar fecha, ingresados, atendidos y espera promedio de ese día. La barra o grupo seleccionado DEBE tener un estado visual distinguible y `aria-pressed`; el detalle DEBE anunciarse a lectores de pantalla mediante una región viva. Al volver a seleccionar la misma barra o grupo, la selección DEBE quitarse y el mensaje inicial DEBE reaparecer. Cada barra o grupo DEBE exponer en su nombre accesible los valores asociados, de modo que la información siga disponible sin la tabla. Las barras con valor cero DEBEN seguir siendo seleccionables.

#### Scenario: Mensaje sin selección
- **WHEN** la vista vertical se muestra sin una barra seleccionada
- **THEN** aparece un mensaje visible que invita a seleccionar una barra para ver la información detallada

#### Scenario: Detalle de una barra de distribución
- **WHEN** el admin selecciona una barra de gravedad en la vista vertical
- **THEN** el panel de detalle muestra la gravedad, la cantidad de casos y el porcentaje de esa barra

#### Scenario: Detalle de un día de la serie
- **WHEN** el admin selecciona cualquiera de las barras de un día en la vista vertical de la serie
- **THEN** el panel de detalle muestra la fecha completa, los ingresados, los atendidos y la espera promedio de ese día

#### Scenario: Selección por teclado
- **WHEN** el admin navega con teclado hasta una barra o grupo y presiona Enter o Espacio
- **THEN** la barra o grupo queda seleccionado, se muestra su detalle y el foco permanece visible

#### Scenario: Deselección
- **WHEN** el admin vuelve a seleccionar la barra o grupo que ya estaba seleccionado
- **THEN** la selección se quita, el estado visual vuelve a no seleccionado y reaparece el mensaje inicial

#### Scenario: Barra con valor cero
- **WHEN** una barra tiene valor cero en la vista vertical
- **THEN** la barra o su grupo sigue siendo seleccionable y el detalle muestra el valor cero o la falta de dato correspondiente

#### Scenario: Nombre accesible con valores
- **WHEN** un lector de pantalla recorre una barra o grupo de la vista vertical
- **THEN** el nombre accesible incluye los valores asociados a esa barra o día, además de la indicación de que puede seleccionarse para ver el detalle

### Requirement: Transporte seguro y privacidad de los datos

La vista DEBE (MUST) obtener las métricas a través del canal server-side del sistema (BFF) adjuntando el token de la sesión del servidor; el navegador nunca DEBE recibir bearer tokens ni llamar directamente al endpoint del backend, y el token no DEBE registrarse en logs ni URLs. La vista no DEBE mostrar datos de identificación de pacientes: solo agregados y distribuciones. En la URL solo pueden viajar `hospitalId`, `desde` y `hasta`.

#### Scenario: Consulta sin exponer credenciales
- **WHEN** la vista obtiene las métricas del período
- **THEN** la llamada se cursa por el BFF del sistema con el token del servidor y no deja bearer tokens ni datos de pacientes en URLs, enlaces ni almacenamiento del navegador

#### Scenario: Fallo del transporte
- **WHEN** el backend o la red no responden dentro del límite del BFF
- **THEN** la vista muestra un aviso reintenable con mensaje normalizado y no ejecuta reintentos automáticos en bucle
