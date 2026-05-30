# Space Mission Control — CRUD de Misiones Espaciales

CRUD personal de misiones espaciales para el taller de mantenimiento de software. Guarda datos en SQLite, expone endpoints REST, registra auditoría estructurada y envía eventos al `epn-event-manager` cuando está disponible.

## 1. Requisitos cubiertos

| Tipo de mantenimiento | Implementación |
|---|---|
| Correctivo | Manejo de errores con middleware, respuestas HTTP claras, eliminación de datos inválidos y logs estructurados con niveles `INFO`, `WARN` y `ERROR`. |
| Adaptativo | Configuración por variables de entorno, API-Key obligatoria mediante `X-FIS-EPN-KEY` y CORS configurable. |
| Perfectivo | Filtros de consulta, documentación OpenAPI, colección Postman y pruebas automatizadas con `node:test`. |
| Preventivo | Validación de campos obligatorios, longitudes máximas, fecha `YYYY-MM-DD`, estados permitidos, patrones maliciosos básicos y consultas SQL preparadas. |

## 2. Ejecución

```bash
npm install
cp .env.example .env
npm start
```

Abrir en el navegador:

```txt
http://localhost:4000
```

Si también se usa el Hub de eventos, iniciar primero `epn-event-manager` en el puerto `3000`.

## 3. Configuración principal

El archivo `.env.example` contiene los valores necesarios:

```env
PORT=4000
API_KEY_HEADER=X-FIS-EPN-KEY
FIS_EPN_API_KEY=fis-epn-2025
REQUIRE_API_KEY=true
MISSIONS_DB_PATH=./db/missions.sqlite
LOG_FILE_PATH=./logs/audit.log
EVENT_MANAGER_URL=http://localhost:3000/events
EVENT_MANAGER_HEALTH_URL=http://localhost:3000/health
SEND_EVENTS=true
CORS_ORIGINS=*
```

La clave por defecto para pruebas locales es:

```txt
X-FIS-EPN-KEY: fis-epn-2025
```

## 4. Base de datos

Archivo generado automáticamente:

```txt
missions-crud/db/missions.sqlite
```

Tabla principal:

```txt
missions
```

Índices creados:

```txt
idx_missions_status
idx_missions_agency
idx_missions_type
```

## 5. Endpoints

| Método | Endpoint | Seguridad | Descripción |
|---|---|---|---|
| GET | `/health` | Pública | Verifica API, BD y conexión con el Hub. |
| GET | `/missions` | API-Key | Lista misiones. Acepta filtros `status`, `agency`, `type`, `q`, `limit`, `offset`. |
| GET | `/missions/:id` | API-Key | Consulta una misión por ID. |
| POST | `/missions` | API-Key | Crea una misión validando entrada. |
| PUT | `/missions/:id` | API-Key | Actualiza una misión existente. |
| DELETE | `/missions/:id` | API-Key | Elimina físicamente una misión. |
| GET | `/missions/stats` | API-Key | Muestra métricas del CRUD. |

## 6. Ejemplos rápidos con curl

Crear una misión:

```bash
curl -X POST http://localhost:4000/missions \
  -H "Content-Type: application/json" \
  -H "X-FIS-EPN-KEY: fis-epn-2025" \
  -d '{
    "name":"Artemis IV",
    "agency":"NASA",
    "type":"Lunar",
    "date":"2028-09-01",
    "status":"planned"
  }'
```

Listar con filtro:

```bash
curl "http://localhost:4000/missions?status=planned&q=artemis" \
  -H "X-FIS-EPN-KEY: fis-epn-2025"
```

Actualizar:

```bash
curl -X PUT http://localhost:4000/missions/MSN-0001 \
  -H "Content-Type: application/json" \
  -H "X-FIS-EPN-KEY: fis-epn-2025" \
  -d '{"status":"active"}'
```

Eliminar:

```bash
curl -X DELETE http://localhost:4000/missions/MSN-0001 \
  -H "X-FIS-EPN-KEY: fis-epn-2025"
```

## 7. Logs de auditoría

Cada acción importante registra una línea JSON en consola y en:

```txt
logs/audit.log
```

Ejemplo:

```json
{"timestamp":"2026-05-28T10:00:00.000Z","level":"INFO","service":"missions-crud","message":"AUDIT_CREATE","action":"CREATE","method":"POST","path":"/missions","missionId":"MSN-0001"}
```

## 8. Documentación de API

- OpenAPI: `docs/openapi.json`
- Postman: `postman/missions-crud.postman_collection.json`

Para visualizar OpenAPI se puede copiar el contenido de `docs/openapi.json` en Swagger Editor.

## 9. Checks de calidad

```bash
npm run check
npm run lint
npm test
```

Qué valida cada comando:

- `check`: revisión de sintaxis de `server.js`.
- `lint`: análisis estático con ESLint.
- `test`: pruebas unitarias y funcionales del CRUD con `node:test`.

## 10. Diagnóstico resumido

Antes de la corrección, el CRUD ya tenía Express, SQLite, endpoints CRUD, validación básica y una interfaz funcional. Las brechas principales eran: ausencia de API-Key, logs no estructurados, poca cobertura de pruebas, falta de documentación OpenAPI/Postman, ausencia de filtros reales en el backend y exposición innecesaria de la ruta física de la base en `/health`.

Después de la corrección, el módulo queda más robusto, observable, configurable y defendible para una demostración en vivo.
