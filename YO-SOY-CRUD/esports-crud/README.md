# 🎮 esports-crud

Sistema de gestión de torneos de deportes electrónicos. API REST con SQLite, logging estructurado y autenticación por API Key.

---

## Requisitos

- **Node.js** `>= 22.5.0`
- **pnpm** (recomendado) — instalar con `npm install -g pnpm`

---

## Instalación

```bash
cd esports-crud
pnpm install
```

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto (o expórtalas directamente):

```env
PORT=4001
ESPORTS_DB_PATH=db/esports.sqlite
EVENT_MANAGER_URL=http://localhost:3000/events
EVENT_MANAGER_HEALTH_URL=http://localhost:3000/health
FIS_API_KEY=FIS-EPN-2026
```

> Si no defines `FIS_API_KEY`, el valor por defecto es `FIS-EPN-2026`.

---

## Comandos disponibles

### Iniciar el servidor

```bash
pnpm start
```

Levanta el servidor en `http://localhost:4001`. Los logs se escriben en consola **y** en `logs/esports-audit.log`.

### Modo desarrollo (equivalente)

```bash
pnpm dev
```

### Verificar sintaxis sin ejecutar

```bash
pnpm check
```

Corre `node --check server.js` — útil para validar que el código compila sin errores antes de desplegar.

### Ejecutar pruebas unitarias

```bash
pnpm test
```

Ejecuta la suite completa con el test runner nativo de Node.js. Deberías ver:

```
# tests 37
# suites 5
# pass  37
# fail  0
```

Las 5 suites cubren:

| Suite | Casos |
|---|---|
| `clean()` | 7 — null, undefined, objeto, array, trim, tipos |
| `normalizeStatus()` | 2 — valores válidos y fallback |
| `validateTournament()` creación | 20 — campos, fechas, límites, inyección |
| `validateTournament()` actualización parcial | 3 — body vacío, campo único, status |
| `ALLOWED_GAMES` catálogo | 5 — longitud, juegos presentes/ausentes |

### Linter

```bash
pnpm lint
```

Corre ESLint sobre todo el proyecto según la configuración en `eslint.config.mjs`.

---

## Endpoints disponibles

Los endpoints de **lectura** no requieren autenticación. Los de **escritura** exigen el header `X-FIS-EPN-KEY`.

### Sin autenticación

```
GET  /health                → estado del servidor y base de datos
GET  /tournaments           → lista todos los torneos
GET  /tournaments/:id       → detalle de un torneo
GET  /tournaments/stats     → estadísticas agregadas
GET  /tournaments/games     → catálogo de juegos permitidos
```

### Con header X-FIS-EPN-KEY requerido

```
POST   /tournaments         → crear torneo
PUT    /tournaments/:id     → actualizar torneo (parcial o total)
DELETE /tournaments/:id     → eliminar torneo
```

**Ejemplo con curl:**

```bash
curl -X POST http://localhost:4001/tournaments \
  -H "Content-Type: application/json" \
  -H "X-FIS-EPN-KEY: FIS-EPN-2026" \
  -d '{
    "name": "EPN Open 2026",
    "game": "Valorant",
    "organizer": "EPN Esports",
    "date_start": "2026-06-01",
    "date_end": "2026-06-10",
    "prize_pool": 1000,
    "max_teams": 8
  }'
```

Sin el header, la respuesta es `401 Unauthorized`.

---

## Estructura del proyecto

```
esports-crud/
├── server.js                      # Servidor principal (Express + SQLite)
├── package.json
├── eslint.config.mjs
├── .env                           # Variables de entorno (crear manualmente)
├── db/
│   └── esports.sqlite             # Base de datos (se crea automáticamente)
├── logs/
│   └── esports-audit.log          # Log de auditoría JSON (se crea automáticamente)
├── public/
│   └── index.html                 # Interfaz web
└── test/
    └── tournament-validation.test.js
```

---

## Logs de auditoría

Cada operación genera una entrada JSON en `logs/esports-audit.log`:

```json
{"timestamp":"2026-05-28T04:00:05.502Z","level":"INFO","action":"CREATE","message":"Torneo creado: TRN-0001","name":"EPN Open 2026","game":"Valorant"}
{"timestamp":"2026-05-28T04:00:09.881Z","level":"WARN","action":"AUTH","message":"Acceso rechazado: API Key inválida o ausente","path":"/tournaments"}
```

Niveles disponibles: `INFO`, `WARN`, `ERROR`.