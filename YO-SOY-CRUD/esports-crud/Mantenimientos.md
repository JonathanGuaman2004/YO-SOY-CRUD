# Mantenimientos Aplicados — `esports-crud`

Registro formal de los cuatro tipos de mantenimiento normados aplicados sobre el sistema de gestión de torneos de deportes electrónicos.

---

## 1. Mantenimiento Correctivo

> **Definición:** Corrección de fallos de lógica, errores de ejecución o comportamientos incorrectos presentes en el código original.

### 1.1 Bug en `clean()` — retorno de `"[object Object]"`

**Problema:** La función `clean()` no tenía guarda de tipo para objetos. Si algún campo del request llegaba como objeto JavaScript en lugar de string, retornaba literalmente `"[object Object]"`, lo que podía persistirse en la base de datos.

**Archivo:** `server.js`

**Antes:**
```js
function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}
```

**Después:**
```js
function clean(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';  // ← guarda de tipo añadida
  return String(value).trim();
}
```

**Impacto:** Evita que datos corruptos lleguen a SQLite cuando el cliente envía un campo con tipo incorrecto.

---

### 1.2 Instrumentación de logs estructurados

**Problema:** El código original usaba `console.log` y `console.error` sin formato, sin niveles de severidad y sin marca de tiempo. Imposible auditar operaciones en producción.

**Archivo:** `server.js`

**Solución:** Se implementó `structuredLog()` con:
- Niveles `INFO`, `WARN`, `ERROR`
- Timestamp en formato ISO 8601 obligatorio
- Escritura simultánea en consola (con colores) y en `logs/esports-audit.log`
- Contexto JSON adicional por operación (`tournamentId`, `name`, `ip`, etc.)

```js
function structuredLog(level, action, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    action,
    message,
    ...meta,
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
}
```

**Ejemplo de entrada generada:**
```json
{"timestamp":"2026-05-29T04:00:05.502Z","level":"INFO","action":"CREATE","message":"Torneo creado: TRN-0001","name":"EPN Open 2026","game":"Valorant"}
```

---

## 2. Mantenimiento Adaptativo

> **Definición:** Modificaciones para que el sistema funcione correctamente bajo nuevas restricciones del entorno, reglas institucionales o infraestructura.

### 2.1 Seguridad por API Key — header `X-FIS-EPN-KEY`

**Contexto:** Los servidores de la facultad requieren que todos los endpoints de escritura estén protegidos por una clave de acceso personalizada.

**Archivos:** `server.js`, `public/index.html`

**Solución en backend:** Se implementó el middleware `requireApiKey()` aplicado a `POST`, `PUT` y `DELETE`. Sin la clave válida, responde `401 Unauthorized` y registra un log `WARN`.

```js
function requireApiKey(req, res, next) {
  const key = req.headers['x-fis-epn-key'];
  if (!key || key !== FIS_API_KEY) {
    logger.warn('AUTH', 'Acceso rechazado: API Key inválida o ausente', {
      ip: req.ip, path: req.path, method: req.method,
    });
    return res.status(401).json({
      error: 'No autorizado. Incluya el header X-FIS-EPN-KEY válido.',
    });
  }
  next();
}

app.post('/tournaments',    requireApiKey, async (req, res) => { ... });
app.put('/tournaments/:id', requireApiKey, async (req, res) => { ... });
app.delete('/tournaments/:id', requireApiKey, async (req, res) => { ... });
```

**Solución en frontend:** Se actualizó `public/index.html` para incluir el header en cada petición de mutación desde la interfaz web. Sin este ajuste, el formulario recibía `401` aunque el servidor estuviera correcto.

```js
// submitForm() — POST y PUT
headers: {
  'Content-Type': 'application/json',
  'X-FIS-EPN-KEY': 'FIS-EPN-2026'   // ← añadido
}

// deleteTournament() — DELETE
fetch(`/tournaments/${id}`, {
  method: 'DELETE',
  headers: { 'X-FIS-EPN-KEY': 'FIS-EPN-2026' }  // ← añadido
})
```

> Este ajuste en el frontend es en sí mismo **Mantenimiento Adaptativo**: no hubo un bug, sino una consecuencia directa de la nueva regla de seguridad del entorno que el cliente debía cumplir.

---

### 2.2 Configuración externa mediante variables de entorno

**Contexto:** Los servidores de la facultad no permiten credenciales ni rutas hardcodeadas en el código fuente. Todo debe ser configurable por entorno.

**Archivo:** `server.js`, `.env`

**Variables externalizadas:**

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `4001` |
| `ESPORTS_DB_PATH` | Ruta a la base de datos SQLite | `db/esports.sqlite` |
| `FIS_API_KEY` | Clave de autenticación institucional | `FIS-EPN-2026` |
| `EVENT_MANAGER_URL` | URL del Event Hub | `http://localhost:3000/events` |
| `EVENT_MANAGER_HEALTH_URL` | URL de health del Hub | `http://localhost:3000/health` |

**Archivo `.env` requerido:**
```env
PORT=4001
FIS_API_KEY=FIS-EPN-2026
ESPORTS_DB_PATH=db/esports.sqlite
EVENT_MANAGER_URL=http://localhost:3000/events
EVENT_MANAGER_HEALTH_URL=http://localhost:3000/health
```

**Carga del `.env` en `package.json`:**
```json
"start": "node --env-file=.env server.js",
"dev":   "node --env-file=.env server.js"
```

---

### 2.3 Validación de orden de fechas

**Contexto:** Regla de negocio institucional: un torneo no puede terminar antes o el mismo día que empieza.

**Archivo:** `server.js` — función `validateTournament()`

```js
if (new Date(dateEnd) <= new Date(dateStart)) {
  errors.push('date_end debe ser posterior a date_start');
}
```

---

## 3. Mantenimiento Perfectivo

> **Definición:** Mejoras que aumentan la calidad interna del sistema: legibilidad, cobertura de pruebas y documentación, sin cambiar el comportamiento externo.

### 3.1 Suite de pruebas unitarias — 37 tests en 5 suites

**Archivo:** `test/tournament-validation.test.js`

Ejecutar con:
```bash
pnpm test
```

| Suite | Tests | Qué valida |
|---|---|---|
| `clean()` | 7 | null, undefined, objeto, array, trim, tipos primitivos |
| `normalizeStatus()` | 2 | valores válidos y fallback a `'próximo'` |
| `validateTournament()` creación | 20 | todos los campos, fechas, límites, inyección, body nulo |
| `validateTournament()` actualización | 3 | body vacío, campo único, status |
| `ALLOWED_GAMES` | 5 | longitud del catálogo, juegos presentes y ausentes |

Resultado esperado:
```
# tests 37
# pass  37
# fail  0
```

### 3.2 Documentación con JSDoc

Todas las funciones públicas exportadas desde `server.js` incluyen documentación estándar:

```js
/**
 * Valida los campos de un torneo.
 * @param {object} data - Cuerpo de la petición
 * @param {boolean} isUpdate - Si es true, solo valida los campos presentes
 * @returns {string[]} Lista de errores encontrados
 */
function validateTournament(data, isUpdate = false) { ... }
```

### 3.3 Logs de auditoría persistentes

Archivo generado automáticamente en `logs/esports-audit.log`. Cada línea es un objeto JSON independiente, lo que permite procesarlo con herramientas como `jq`, `grep` o cualquier sistema de monitoreo:

```bash
# Ver solo errores
grep '"level":"ERROR"' logs/esports-audit.log

# Ver todas las creaciones
grep '"action":"CREATE"' logs/esports-audit.log
```

---

## 4. Mantenimiento Preventivo

> **Definición:** Salvaguardas diseñadas para blindar el sistema antes de que los fallos ocurran en producción.

### 4.1 Sanitización rigurosa de entrada

**Archivo:** `server.js` — función `validateTournament()`

| Campo | Restricción añadida |
|---|---|
| `name` | Rechaza caracteres `<`, `>`, `{}` (previene inyección HTML/JSON) |
| `name` | Máximo 80 caracteres |
| `organizer` | Máximo 60 caracteres |
| `description` | Máximo 400 caracteres |
| `prize_pool` | Mínimo 0, máximo 10,000,000 (evita desbordamiento) |
| `max_teams` | Rango estricto entre 2 y 256 |
| body completo | Rechaza `null` y no-objetos antes de cualquier validación |

```js
// Rechazo de body nulo
if (data === null || typeof data !== 'object') {
  return ['El cuerpo de la petición debe ser un objeto JSON válido'];
}

// Detección de inyección en nombre
if (/[<>{}]/.test(name)) {
  errors.push('name contiene caracteres no permitidos');
}

// Límite de prize_pool para evitar desbordamiento
if (prizePool > 10_000_000) {
  errors.push('prize_pool no puede superar 10,000,000');
}
```

### 4.2 Estructura Try-Catch granular

Cada ruta HTTP tiene su propio bloque `try-catch` independiente. Un error en una operación no interrumpe el servidor ni afecta otras rutas.

```js
app.post('/tournaments', requireApiKey, async (req, res) => {
  try {
    const t = insertTournament(req.body);
    logger.info('CREATE', `Torneo creado: ${t.id}`);
    return res.status(201).json(t);
  } catch (err) {
    logger.error('CREATE', 'Error al insertar torneo', { error: err.message });
    return res.status(500).json({ error: 'Error interno al crear el torneo' });
  }
});
```

### 4.3 Middleware de trazabilidad de requests

Cada petición entrante queda registrada antes de llegar a cualquier ruta, garantizando que incluso las peticiones que fallan antes del controlador dejan rastro.

```js
app.use((req, res, next) => {
  logger.info('REQUEST', `${req.method} ${req.path}`, { ip: req.ip });
  next();
});
```

---

## Resumen

| # | Tipo | Cambio principal | Archivos |
|---|---|---|---|
| 1.1 | Correctivo | Bug `clean()` con objetos JS | `server.js` |
| 1.2 | Correctivo | Logger estructurado ISO 8601 | `server.js` |
| 2.1 | Adaptativo | API Key en backend y frontend | `server.js`, `index.html` |
| 2.2 | Adaptativo | Variables de entorno externalizadas | `server.js`, `.env`, `package.json` |
| 2.3 | Adaptativo | Validación de orden de fechas | `server.js` |
| 3.1 | Perfectivo | Suite 37 pruebas unitarias | `test/tournament-validation.test.js` |
| 3.2 | Perfectivo | Documentación JSDoc | `server.js` |
| 3.3 | Perfectivo | Logs de auditoría persistentes | `server.js` |
| 4.1 | Preventivo | Sanitización de entrada y límites | `server.js` |
| 4.2 | Preventivo | Try-Catch granular por ruta | `server.js` |
| 4.3 | Preventivo | Middleware de trazabilidad global | `server.js` |