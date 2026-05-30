# Cambios aplicados en `missions-crud`

## Archivos modificados

### `server.js`
- Se agregó carga simple de variables desde `.env` sin dependencia extra.
- Se agregó protección por API-Key con cabecera `X-FIS-EPN-KEY`.
- Se agregaron logs estructurados JSON con `timestamp`, `level`, `service`, `message` y datos de auditoría.
- Se agregó escritura de auditoría en `logs/audit.log`.
- Se agregaron filtros reales en `GET /missions`: `status`, `agency`, `type`, `q`, `limit`, `offset`.
- Se reforzó la validación de entradas: campos obligatorios, longitudes máximas, estados válidos, fecha `YYYY-MM-DD` y patrones maliciosos básicos.
- Se mantuvieron consultas preparadas para SQLite.
- Se agregó middleware de errores y respuesta `404` estandarizada.
- Se dejó `/health` sin revelar la ruta física de la base de datos.
- Se agregó `SEND_EVENTS=false` para pruebas automatizadas sin depender del Hub.

### `public/index.html`
- Se agregó envío de la cabecera `X-FIS-EPN-KEY` en las llamadas CRUD.
- Se agregó escape HTML para evitar que datos ingresados por el usuario se inserten sin protección en `innerHTML`.
- Se ajustó la búsqueda para usar filtros reales del backend.
- Se mantiene la interfaz visual de misiones con formulario, tarjetas, métricas y logs.

### `package.json`
- Se mejoró la descripción y metadatos.
- Se mantienen scripts: `start`, `check`, `lint` y `test`.

### `test/mission-api.test.js`
- Se agregaron pruebas de validación de campos obligatorios.
- Se agregaron pruebas preventivas contra entradas maliciosas básicas.
- Se agregó prueba de seguridad: sin `X-FIS-EPN-KEY` devuelve `401`.
- Se agregó prueba de ciclo CRUD: crear, filtrar, actualizar y eliminar.

## Archivos agregados

### `.env.example`
- Centraliza configuración de puerto, API-Key, base SQLite, logs, CORS y Event Manager.

### `docs/openapi.json`
- Documenta los endpoints, seguridad por API-Key, parámetros y esquemas.

### `postman/missions-crud.postman_collection.json`
- Colección lista para probar el CRUD desde Postman.

## Archivo recomendado para corregir también en el repo

### `.github/workflows/ci.yml`
- El repositorio tiene los proyectos dentro de la carpeta `YO-SOY-CRUD/`, por eso los `working-directory` del workflow deben apuntar a `YO-SOY-CRUD/missions-crud` y `YO-SOY-CRUD/epn-event-manager`.
