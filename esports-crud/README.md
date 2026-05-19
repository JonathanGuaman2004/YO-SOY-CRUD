# Esports Tournament Manager — CRUD de Torneos de eSports

Este módulo es el CRUD de torneos de deportes electrónicos. Guarda los torneos en una base SQLite propia y envía eventos al `epn-event-manager` mediante `POST /events`.

## Ejecución

```bash
pnpm install
pnpm start
```

Abrir en el navegador:

```txt
http://localhost:4001
```

## Base de datos del CRUD

Archivo generado automáticamente:

```txt
esports-crud/db/esports.sqlite
```

Tabla principal:

```txt
tournaments
```

## Endpoints del CRUD

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Verifica API, BD y conexión con el Hub |
| GET | `/tournaments` | Lista todos los torneos |
| GET | `/tournaments/:id` | Consulta un torneo por ID |
| POST | `/tournaments` | Crea un torneo |
| PUT | `/tournaments/:id` | Actualiza un torneo |
| DELETE | `/tournaments/:id` | Elimina un torneo |
| GET | `/tournaments/stats` | Métricas del CRUD |
| GET | `/tournaments/games` | Lista de juegos permitidos |

## Juegos permitidos

- League of Legends
- Valorant
- CS2
- Dota 2
- Fortnite
- Rocket League
- FIFA
- Street Fighter 6
- Apex Legends
- Overwatch 2

## Estados de torneo

- `próximo`
- `en_curso`
- `finalizado`
- `cancelado`

## Checks de calidad

```bash
pnpm run check
pnpm run lint
pnpm test
```

- `check`: verifica sintaxis de `server.js`.
- `lint`: análisis estático básico sin ejecutar el servidor.
- `test`: pruebas unitarias con `node:test`.

> Nota: este CRUD usa el módulo nativo `node:sqlite`, por eso debe ejecutarse con Node.js 22.5.0 o superior.

## Mantenimiento Adaptativo aplicado

### Cambio de puerto (4000 → 4001)

**Problema**: El puerto por defecto 4000 ya está usado por `missions-crud`. Si ambos CRUDs se ejecutan simultáneamente, el segundo falla por conflicto de puerto.

**Solución**: Se cambió el puerto por defecto de `4000` a `4001` en `server.js`:

```js
const PORT = process.env.PORT || 4001;
```

Esto permite ejecutar ambos proyectos en paralelo:
- `missions-crud`: http://localhost:4000
- `esports-crud`: http://localhost:4001

El puerto puede seguir modificándose via variable de entorno `PORT`.

### Mantenimiento ya presente en el código

| Tipo | Ubicación | Descripción |
|------|-----------|-------------|
| **Correctivo** | `server.js:clean()` | Evita `[object Object]` para valores objetos |
| **Adaptativo** | `server.js:validateTournament()` | Valida `date_end > date_start` |
| **Preventivo** | `server.js:validateTournament()` | Limita longitud de `description` y rango de `max_teams` |