# Space Mission Control — CRUD de Misiones Espaciales

Este módulo es el CRUD personal de misiones espaciales. Guarda las misiones en una base SQLite propia y, además, envía eventos al `epn-event-manager` mediante `POST /events`.

## Ejecución

```bash
npm install
npm start
```

Abrir en el navegador:

```txt
http://localhost:4000
```

## Base de datos del CRUD

Archivo generado automáticamente:

```txt
missions-crud/db/missions.sqlite
```

Tabla principal:

```txt
missions
```

## Endpoints del CRUD

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/health` | Verifica API, BD y conexión con el Hub |
| GET | `/missions` | Lista todas las misiones guardadas en SQLite |
| GET | `/missions/:id` | Consulta una misión por ID |
| POST | `/missions` | Crea una misión |
| PUT | `/missions/:id` | Actualiza una misión |
| DELETE | `/missions/:id` | Elimina una misión |
| GET | `/missions/stats` | Métricas del CRUD |

## Checks de calidad

```bash
npm run check
npm run lint
npm test
```

- `check`: verifica sintaxis de `server.js`.
- `lint`: análisis estático básico sin ejecutar el servidor.
- `test`: pruebas unitarias con `node:test`.

## Mantenimiento perfectivo aplicado

Antes, las misiones se guardaban en memoria del servidor. Al reiniciar el backend, se perdían y la interfaz no podía recuperar lo creado previamente. Como mejora perfectiva, se agregó persistencia real con SQLite, endpoints completos de consulta y estadísticas, manteniendo la integración con el Event Manager.

> Nota: este CRUD usa el módulo nativo `node:sqlite`, por eso debe ejecutarse con Node.js 22 o superior.
