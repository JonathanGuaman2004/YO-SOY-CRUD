# YO-SOY-CRUD

Monorepo de talleres de industrialización de software: un conjunto de servicios CRUD independientes que se integran entre sí mediante eventos HTTP, trabajado bajo un enfoque iterativo e incremental con gestión de tickets, CI, Pull Requests y releases versionados.

## Descripción

El objetivo de este proyecto **no** es adoptar una metodología ágil rígida (Scrum/Kanban), sino **industrializar un monorepo existente** mediante mejoras progresivas: gestión de tickets, documentación, pipeline de CI, Pull Requests, revisión de código, pruebas automatizadas y generación de releases. El avance se controla con un tablero de GitHub Project (Backlog → Done).

## Módulos del monorepo

| Módulo | Puerto | Framework | Notas |
|---|---|---|---|
| `epn-event-manager/` | **3000** | NestJS + TypeORM + SQLite | Event Hub central |
| `missions-crud/` | **4000** | Express + `node:sqlite` | Misiones espaciales |
| `esports-crud/` | **4001** | Express + `node:sqlite` | Torneos de eSports |
| `pets-crud/` | **4002** | Express + `node:sqlite` | Gestión de mascotas |
| `audiohub-crud/` | — | Express + `node:sqlite` | Catálogo de audios |
| `audiohub-frontend/` | — | HTML/JS estático | Sin `package.json` |

> Nota: `audiohub-crud` incluye además una colección de Postman (`AudioHub-Postman-Collection.json`) para probar sus endpoints.

## Arquitectura

Los CRUDs son servicios REST independientes que reportan eventos a un núcleo central de eventos:

```
CRUDs REST → HTTP POST /events → EPN Event Manager → SQLite
```

**Regla arquitectónica:** los controladores solo reciben solicitudes y delegan la lógica; la lógica de negocio se mantiene separada de infraestructura, configuración, logs y acceso a datos.

## Requisitos

- Node.js **22.5.0+** (se usa el módulo nativo `node:sqlite`)
- `pnpm`

## Orden de ejecución

1. Levantar primero `epn-event-manager` (puerto 3000), ya que actúa como núcleo central de eventos.
2. Levantar luego cualquiera de los CRUDs (puertos 4000–4002).

## Instalación y ejecución

### `epn-event-manager`

```bash
cd epn-event-manager
pnpm install
pnpm run build
pnpm run lint
pnpm test
pnpm run start:dev
```

### `missions-crud` / `esports-crud` / `pets-crud`

```bash
cd <proyecto>
pnpm install
pnpm run check
pnpm run lint
pnpm test
pnpm start
```

### Verificación de calidad completa

```bash
pnpm run check && pnpm run lint && pnpm test
```

## Funcionalidades por módulo (release v2.0.0)

La versión `v2.0.0` consolida 12 tickets de features, bugs y technical debt trabajados sobre los 5 módulos del monorepo, incorporando búsqueda, filtrado y paginación, refuerzos de seguridad, normalización del contrato de eventos y pruebas E2E con umbral de cobertura del 80%.

### epn-event-manager

- **EM-01:** filtros por `source`, `entity` y `action` en `GET /events`, con paginación (`limit`, `offset`) y metadata de paginación.
- **EM-02:** `GET /stats` ampliado con agrupaciones por `action`, `source`, `entity` y `day`, más filtros opcionales por `source`, `from` y `to`.
- **EM-03:** contrato de eventos normalizado con el campo unificado `occurredAt`; se eliminaron campos internos (`_table`, `_eventDate`, `recorded_at`, `timestamp`, `createdAt`, `event_date`) y se garantiza que `payload` sea un objeto JSON válido.
- **EM-04:** pruebas E2E reales sobre todos los endpoints (reemplazando las de "Hello World") y umbral global de cobertura del 80% configurado en el pipeline CI.

### audiohub-crud

- **AU-01:** `GET /audios` con filtros (`tipo`, `autor`, `q`), ordenamiento (`sortBy`, `order`) y paginación (`page`, `limit`, máx. 100), con respuesta estructurada `{ data, pagination }`.
- **AU-02:** regla de duplicidad (tipo + título + autor normalizados) que devuelve HTTP 409 en `POST /audios` y `PUT /audios/:id` cuando se detectan coincidencias, sin persistir el registro ni emitir evento `CREATE`.

### pets-crud

- **PE-01:** `GET /pets` ampliado con filtros por `species`, `status`, `owner`, rango de edad (`minAge`, `maxAge`), búsqueda por `q` y paginación estructurada.
- **PE-02:** operaciones de escritura (`POST`, `PUT`, `DELETE`) protegidas con la cabecera `X-FIS-EPN-KEY`, devolviendo HTTP 401 sin llave y HTTP 403 con llave inválida.

### esports-crud

- **ES-01:** `GET /tournaments` ampliado con filtros combinables (`game`, `status`, `organizer`, `dateFrom`, `dateTo`, `minPrize`, `maxPrize`), ordenamiento y paginación.
- **ES-02:** corrección de validación del rango de fechas en `PUT /tournaments/:id`, rechazando body vacío, `null` o combinaciones donde `date_end <= date_start`.

### missions-crud

- **MI-01:** `GET /missions` con respuesta paginada (`data`, `pagination`), soporte para `limit`, `offset` y `page`, y metadata completa (`total`, `limit`, `offset`, `page`, `totalPages`, `returned`, `hasNextPage`), manteniendo los filtros existentes por `status`, `agency`, `type` y `q`.
- **MI-02:** validación estricta de fechas en formato `YYYY-MM-DD`, rechazando fechas calendario inexistentes (ej. `2028-02-31`) y formatos incorrectos.

## Equipo de trabajo

| Integrante | Event Manager | CRUD - Ticket 1 | CRUD - Ticket 2 |
|---|---|---|---|
| Shirley | EM-01 Filtros y paginación | MI-01 Paginación de misiones | MI-02 Validación estricta de fechas |
| Jonathan | EM-02 Estadísticas avanzadas | ES-01 Filtros de torneos | ES-02 Fechas en actualización |
| Helen | EM-03 Normalización de eventos | PE-01 Filtros y paginación | PE-02 Seguridad con API Key |
| Christian | EM-04 E2E y cobertura | AU-01 Filtros de audios | AU-02 Evitar duplicados |

## Metodología de trabajo

### Enfoque iterativo e incremental

Cada incremento entrega una mejora verificable (tickets, documentación, CI, PRs, revisión de código, pruebas o releases).

### Definition of Ready (DoR)

Un ticket está listo para iniciar cuando tiene:

- Título claro y descripción del problema o necesidad.
- Tipo definido: Feature, Bug, Technical Debt o Task.
- Módulo asociado del monorepo.
- Criterios de aceptación verificables.
- Prioridad y responsable asignados.
- Posibilidad de trabajarse en una rama independiente.

### Definition of Done (DoD)

Una tarea se considera terminada cuando:

- Fue trabajada en una rama distinta a `main`.
- Tiene un Pull Request asociado y vinculado al issue.
- El pipeline CI pasó correctamente y se ejecutaron las pruebas correspondientes.
- El código fue revisado por al menos un compañero.
- La documentación fue actualizada si aplica.
- El issue fue cerrado correctamente.

## Estrategia de ramas

| Rama | Propósito |
|---|---|
| `main` | Rama estable para releases |
| `develop` | Rama de integración incremental |
| `feature/*` | Nuevas funcionalidades o configuración |
| `bugfix/*` | Correcciones |
| `docs/*` | Documentación |
| `refactor/*` | Mejoras internas o deuda técnica |

**Flujo:** `feature/*` → Pull Request → `develop` → Pull Request → `main` → Release

**Regla:** no se permite hacer push directo a `main`; todo cambio pasa por Pull Request y revisión.

## Política de Pull Requests

- Todo cambio se integra mediante PR, vinculado a un issue.
- El PR debe indicar el módulo afectado y tener una descripción clara.
- El pipeline CI debe pasar correctamente antes del merge.
- Al menos un compañero debe revisar el PR.
- No se hace merge si fallan las pruebas.

## Pipeline de CI

Se ejecuta ante:

- `pull_request` hacia `develop` y hacia `main`.
- `push` hacia `develop` y hacia `main`.
- `workflow_dispatch` (ejecución manual).

Verificaciones incluidas: instalación de dependencias, check/compilación, linting, build (cuando aplica), pruebas unitarias, pruebas de integración y coverage (cuando aplica). El objetivo es evitar que código con errores llegue a las ramas principales.

## Releases y versionamiento

Se usa versionamiento semántico (`MAJOR.MINOR.PATCH`).

### Historial de releases

- `v0.1.0` — organización inicial del proyecto.
- `v0.2.0` — documentación y políticas.
- `v0.3.0` — pipeline CI.
- `v1.0.0` — entrega final del taller: industrialización completa del monorepo (gestión, documentación, CI, Pull Requests y evidencias).
- `v1.1.1` a `v1.1.12` — micro-releases individuales por ticket (uno por cada feature/bug/technical debt resuelto en cada módulo).
- **`v2.0.0` (última)** — release mayor que consolida los 12 tickets trabajados por el equipo sobre `epn-event-manager`, `pets-crud`, `esports-crud`, `missions-crud` y `audiohub-crud`.

### v2.0.0 — Consolidación de módulos: features, bugs y technical debt

**Rama asociada:** `develop → main`

**Tickets consolidados:** cierra los issues [#16](https://github.com/JonathanGuaman2004/YO-SOY-CRUD/issues/16), [#17](https://github.com/JonathanGuaman2004/YO-SOY-CRUD/issues/17), [#18](https://github.com/JonathanGuaman2004/YO-SOY-CRUD/issues/18), [#22](https://github.com/JonathanGuaman2004/YO-SOY-CRUD/issues/22)–[#30](https://github.com/JonathanGuaman2004/YO-SOY-CRUD/issues/30).

**Sub-releases incluidos:** `v1.1.1`, `v1.1.2`, `v1.1.3`, `v1.1.4`, `v1.1.5`, `v1.1.6`, `v1.1.7`, `v1.1.8`, `v1.1.9`, `v1.1.10`, `v1.1.11`, `v1.1.12`.

**Validaciones:**

- Todos los Pull Requests individuales aprobados y mergeados a `develop`.
- Pipeline CI en verde en cada uno de los PRs previos.
- `npm run check`, `npm run lint` y `npm test` ejecutados en cada módulo.
- Cobertura del 80% verificada en `epn-event-manager`.
- Smoke tests manuales verificados en los endpoints protegidos y filtrados.

**Autores:**

- Sigcha Christian
- Guamán Jonathan
- Jarrín Helen
- Maldonado Shirley

## Evidencias del taller

- **Gestión:** GitHub Project creado, issues clasificados, labels por tipo y módulo.
- **Integración continua:** pipeline CI configurado, GitHub Actions ejecutado en Pull Requests, validaciones de check/lint/build/test/coverage.
- **Revisión:** Pull Requests creados, revisión por pares aplicada, merge controlado hacia `develop` y `main`.
- **Release:** versión `v1.0.0` publicada.

## Estructura de documentación

```
docs/
├── 01-enfoque-iterativo-incremental.md
├── 02-definition-of-ready.md
├── 03-definition-of-done.md
├── 04-arquitectura.md
├── 05-estrategia-ramas.md
├── 06-pull-request-policy.md
├── 07-pipeline-ci.md
├── 08-releases-versionamiento.md
└── 09-evidencias.md
```

## Notas para exportación

Para exportar el proyecto en zip sin que pese demasiado, se elimina `node_modules/` y `pnpm-lock.yaml` de cada módulo; quien lo reciba deberá ejecutar `pnpm install` en cada carpeta.
