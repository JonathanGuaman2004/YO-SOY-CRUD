'use strict';

const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const { DatabaseSync } = require('node:sqlite');

// ═══════════════════════════════════════════════════════════
// MANTENIMIENTO CORRECTIVO — Logger estructurado con niveles
// Winston-style logger usando únicamente módulos nativos
// ═══════════════════════════════════════════════════════════
const LOG_DIR  = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'esports-audit.log');
fs.mkdirSync(LOG_DIR, { recursive: true });

const LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };

function structuredLog(level, action, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),   // ISO 8601 obligatorio
    level,
    action,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  // Consola con colores básicos
  const color = level === LEVELS.ERROR ? '\x1b[31m'
              : level === LEVELS.WARN  ? '\x1b[33m'
              :                          '\x1b[36m';
  console.log(`${color}[${entry.timestamp}] [${level}] [${action}]\x1b[0m ${message}`);
  // Escritura en archivo de auditoría
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

const logger = {
  info:  (action, msg, meta) => structuredLog(LEVELS.INFO,  action, msg, meta),
  warn:  (action, msg, meta) => structuredLog(LEVELS.WARN,  action, msg, meta),
  error: (action, msg, meta) => structuredLog(LEVELS.ERROR, action, msg, meta),
};

// ═══════════════════════════════════════════════════════════
// MANTENIMIENTO ADAPTATIVO — Configuración externa (.env)
// Variables críticas extraídas del entorno institucional
// ═══════════════════════════════════════════════════════════
const EVENT_MANAGER_URL        = process.env.EVENT_MANAGER_URL        || 'http://localhost:3000/events';
const EVENT_MANAGER_HEALTH_URL = process.env.EVENT_MANAGER_HEALTH_URL || 'http://localhost:3000/health';
const PORT     = process.env.PORT            || 4001;
const DB_DIR   = path.join(__dirname, 'db');
const DB_PATH  = process.env.ESPORTS_DB_PATH || path.join(DB_DIR, 'esports.sqlite');

// MANTENIMIENTO ADAPTATIVO — Clave API institucional requerida
// El header X-FIS-EPN-KEY debe estar presente en todas las mutaciones
const FIS_API_KEY = process.env.FIS_API_KEY || 'FIS-EPN-2026';

// ── Middleware de autenticación por API-Key ──────────────────
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

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Middleware de trazabilidad de requests ───────────────────
app.use((req, res, next) => {
  logger.info('REQUEST', `${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ── Valores permitidos ───────────────────────────────────────
const ALLOWED_STATUS = ['próximo', 'en_curso', 'finalizado', 'cancelado'];
const ALLOWED_GAMES  = [
  'League of Legends', 'Valorant', 'CS2', 'Dota 2',
  'Fortnite', 'Rocket League', 'FIFA', 'Street Fighter 6',
  'Apex Legends', 'Overwatch 2',
];

// ── Base de datos ────────────────────────────────────────────
fs.mkdirSync(DB_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function migrateDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      game        TEXT NOT NULL,
      organizer   TEXT NOT NULL,
      date_start  TEXT NOT NULL,
      date_end    TEXT NOT NULL,
      prize_pool  REAL NOT NULL DEFAULT 0,
      max_teams   INTEGER NOT NULL DEFAULT 8,
      status      TEXT NOT NULL DEFAULT 'próximo',
      description TEXT,
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
    CREATE INDEX IF NOT EXISTS idx_tournaments_game   ON tournaments(game);
  `);
  logger.info('DB', 'Migración completada', { db: DB_PATH });
}
migrateDatabase();

// ═══════════════════════════════════════════════════════════
// MANTENIMIENTO PREVENTIVO — Sanitización rigurosa de entrada
// Validación exhaustiva de tipos, nulos y desbordamiento
// ═══════════════════════════════════════════════════════════

/**
 * Limpia y convierte un valor a string seguro.
 * @param {*} value
 * @returns {string}
 */
function clean(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';    // ← Bug correctivo: evita "[object Object]"
  return String(value).trim();
}

/**
 * Normaliza el campo status; devuelve 'próximo' si el valor no es válido.
 * @param {string} status
 * @returns {string}
 */
function normalizeStatus(status) {
  const s = clean(status || 'próximo');
  return ALLOWED_STATUS.includes(s) ? s : 'próximo';
}

/**
 * Valida los campos de un torneo.
 * MANTENIMIENTO PREVENTIVO: control de tipos, rangos y longitudes.
 * MANTENIMIENTO ADAPTATIVO:  validación de orden de fechas.
 * @param {object} data
 * @param {boolean} isUpdate
 * @returns {string[]} lista de errores
 */
function validateTournament(data, isUpdate = false) {
  const errors = [];

  // PREVENTIVO: control estricto de nulos y tipos
  if (data === null || typeof data !== 'object') {
    return ['El cuerpo de la petición debe ser un objeto JSON válido'];
  }

  const name       = clean(data.name);
  const game       = clean(data.game);
  const organizer  = clean(data.organizer);
  const dateStart  = clean(data.date_start);
  const dateEnd    = clean(data.date_end);
  const prizePool  = Number(data.prize_pool);
  const maxTeams   = Number(data.max_teams);
  const status     = clean(data.status || 'próximo');
  const desc       = clean(data.description);

  if (!isUpdate || data.name !== undefined) {
    if (!name)             errors.push('name es obligatorio');
    if (name.length > 80)  errors.push('name no puede superar 80 caracteres');
    // PREVENTIVO: detectar inyección básica de caracteres especiales
    if (/[<>{}]/.test(name)) errors.push('name contiene caracteres no permitidos');
  }

  if (!isUpdate || data.game !== undefined) {
    if (!game)                         errors.push('game es obligatorio');
    if (!ALLOWED_GAMES.includes(game)) errors.push(`game debe ser uno de: ${ALLOWED_GAMES.join(', ')}`);
  }

  if (!isUpdate || data.organizer !== undefined) {
    if (!organizer)            errors.push('organizer es obligatorio');
    if (organizer.length > 60) errors.push('organizer no puede superar 60 caracteres');
  }

  if (!isUpdate || data.date_start !== undefined) {
    if (!dateStart)                              errors.push('date_start es obligatorio');
    if (dateStart && isNaN(Date.parse(dateStart))) errors.push('date_start debe ser fecha válida (ISO)');
  }

  if (!isUpdate || data.date_end !== undefined) {
    if (!dateEnd)                              errors.push('date_end es obligatorio');
    if (dateEnd && isNaN(Date.parse(dateEnd))) errors.push('date_end debe ser fecha válida (ISO)');
  }

  // ADAPTATIVO: fecha de fin debe ser posterior a fecha de inicio
  if (dateStart && dateEnd && !isNaN(Date.parse(dateStart)) && !isNaN(Date.parse(dateEnd))) {
    if (new Date(dateEnd) <= new Date(dateStart)) {
      errors.push('date_end debe ser posterior a date_start');
    }
  }

  if (data.prize_pool !== undefined) {
    if (isNaN(prizePool) || prizePool < 0) errors.push('prize_pool debe ser un número positivo');
    // PREVENTIVO: límite razonable para evitar desbordamiento
    if (prizePool > 10_000_000)            errors.push('prize_pool no puede superar 10,000,000');
  }

  if (data.max_teams !== undefined && (isNaN(maxTeams) || maxTeams < 2 || maxTeams > 256)) {
    errors.push('max_teams debe estar entre 2 y 256');
  }

  if (data.status !== undefined && !ALLOWED_STATUS.includes(status)) {
    errors.push(`status inválido. Opciones: ${ALLOWED_STATUS.join(', ')}`);
  }

  if (desc.length > 400) {
    errors.push('description no puede superar 400 caracteres');
  }

  return errors;
}

function validateTournamentQuery(query = {}) {
  const errors = [];
  const page = Number(query.page);
  const limit = Number(query.limit);
  const minPrize = Number(query.minPrize);
  const maxPrize = Number(query.maxPrize);
  const dateFrom = clean(query.dateFrom);
  const dateTo = clean(query.dateTo);
  const sortBy = clean(query.sortBy);
  const order = clean(query.order);

  if (query.page !== undefined && (!Number.isInteger(page) || page < 1)) {
    errors.push('page debe ser un número entero mayor o igual a 1');
  }

  if (query.limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    errors.push('limit debe ser un número entero entre 1 y 100');
  }

  if (query.minPrize !== undefined && query.minPrize !== '' && (isNaN(minPrize) || minPrize < 0)) {
    errors.push('minPrize debe ser un número positivo');
  }

  if (query.maxPrize !== undefined && query.maxPrize !== '' && (isNaN(maxPrize) || maxPrize < 0)) {
    errors.push('maxPrize debe ser un número positivo');
  }

  if (dateFrom && isNaN(Date.parse(dateFrom))) {
    errors.push('dateFrom debe ser una fecha válida en formato ISO (YYYY-MM-DD)');
  }

  if (dateTo && isNaN(Date.parse(dateTo))) {
    errors.push('dateTo debe ser una fecha válida en formato ISO (YYYY-MM-DD)');
  }

  if (
    !isNaN(minPrize) && !isNaN(maxPrize) &&
    query.minPrize !== undefined && query.minPrize !== '' &&
    query.maxPrize !== undefined && query.maxPrize !== '' &&
    minPrize > maxPrize
  ) {
    errors.push('minPrize no puede ser mayor que maxPrize');
  }

  if (sortBy && !ALLOWED_SORT_BY.includes(sortBy)) {
    errors.push(`sortBy inválido. Opciones: ${ALLOWED_SORT_BY.join(', ')}`);
  }

  if (order && !['asc', 'desc'].includes(order.toLowerCase())) {
    errors.push('order debe ser "asc" o "desc"');
  }

  return errors;
}

const VALID_UPDATE_FIELDS = [
  'name', 'game', 'organizer', 'date_start', 'date_end',
  'prize_pool', 'max_teams', 'status', 'description',
];

function validateUpdateBody(body) {
  const errors = [];
  if (body === null || typeof body !== 'object') {
    return ['El cuerpo de la petición debe ser un objeto JSON válido'];
  }
  const hasAnyField = VALID_UPDATE_FIELDS.some(f => f in body);
  if (!hasAnyField) {
    errors.push('No se enviaron campos válidos para actualizar');
  }
  return errors;
}

function validateFinalDateRange(stored, body) {
  const errors = [];
  const finalDateStart = body.date_start !== undefined ? clean(body.date_start) : stored.date_start;
  const finalDateEnd = body.date_end !== undefined ? clean(body.date_end) : stored.date_end;

  if (finalDateStart && finalDateEnd) {
    if (isNaN(Date.parse(finalDateStart))) {
      errors.push('date_start debe ser una fecha válida en formato ISO');
      return errors;
    }
    if (isNaN(Date.parse(finalDateEnd))) {
      errors.push('date_end debe ser una fecha válida en formato ISO');
      return errors;
    }
    if (new Date(finalDateEnd) <= new Date(finalDateStart)) {
      errors.push('date_end debe ser posterior a date_start');
    }
  }
  return errors;
}

// ── IDs ─────────────────────────────────────────────────────
function nextTournamentId() {
  const row = db
    .prepare("SELECT id FROM tournaments WHERE id LIKE 'TRN-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1")
    .get();
  const last = row ? Number(String(row.id).replace('TRN-', '')) : 0;
  return `TRN-${String(last + 1).padStart(4, '0')}`;
}

// ── Mapeo de fila ────────────────────────────────────────────
function mapTournament(row) {
  return {
    id:          row.id,
    name:        row.name,
    game:        row.game,
    organizer:   row.organizer,
    date_start:  row.date_start,
    date_end:    row.date_end,
    prize_pool:  row.prize_pool,
    max_teams:   row.max_teams,
    status:      row.status,
    description: row.description || '',
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

// ── CRUD DB ──────────────────────────────────────────────────
function findAllTournaments() {
  return db.prepare('SELECT * FROM tournaments ORDER BY createdAt DESC').all().map(mapTournament);
}

function buildTournamentWhere(filters = {}) {
  const where = [];
  const params = [];

  if (filters.game) {
    where.push('game = ?');
    params.push(filters.game);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.organizer) {
    where.push('organizer LIKE ?');
    params.push(`%${filters.organizer}%`);
  }
  if (filters.dateFrom) {
    where.push('date_start >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push('date_end <= ?');
    params.push(filters.dateTo);
  }
  if (filters.minPrize !== undefined && filters.minPrize !== '') {
    where.push('prize_pool >= ?');
    params.push(Number(filters.minPrize));
  }
  if (filters.maxPrize !== undefined && filters.maxPrize !== '') {
    where.push('prize_pool <= ?');
    params.push(Number(filters.maxPrize));
  }

  return { where, params };
}

const ALLOWED_SORT_BY = ['name', 'game', 'organizer', 'date_start', 'date_end', 'prize_pool', 'status', 'createdAt'];

function findTournaments(filters = {}) {
  const page = Math.max(Number(filters.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 100);
  const offset = (page - 1) * limit;

  const sortBy = ALLOWED_SORT_BY.includes(filters.sortBy) ? filters.sortBy : 'createdAt';
  const order = filters.order && filters.order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const { where, params } = buildTournamentWhere(filters);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM tournaments ${whereSql}`)
    .get(...params).total;

  const sql = `SELECT * FROM tournaments ${whereSql} ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
  const data = db.prepare(sql).all(...params, limit, offset).map(mapTournament);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}

function findTournamentById(id) {
  const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(clean(id));
  return row ? mapTournament(row) : null;
}

function insertTournament(body) {
  const now = new Date().toISOString();
  const t = {
    id:          nextTournamentId(),
    name:        clean(body.name),
    game:        clean(body.game),
    organizer:   clean(body.organizer),
    date_start:  clean(body.date_start),
    date_end:    clean(body.date_end),
    prize_pool:  Number(body.prize_pool) || 0,
    max_teams:   Number(body.max_teams) || 8,
    status:      normalizeStatus(body.status),
    description: clean(body.description),
    createdAt:   now,
    updatedAt:   now,
  };
  db.prepare(`
    INSERT INTO tournaments (id,name,game,organizer,date_start,date_end,prize_pool,max_teams,status,description,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(t.id, t.name, t.game, t.organizer, t.date_start, t.date_end,
         t.prize_pool, t.max_teams, t.status, t.description, t.createdAt, t.updatedAt);
  return t;
}

function updateTournament(id, body) {
  const current = findTournamentById(id);
  if (!current) return null;
  const updated = {
    ...current,
    name:        body.name        !== undefined ? clean(body.name)        : current.name,
    game:        body.game        !== undefined ? clean(body.game)        : current.game,
    organizer:   body.organizer   !== undefined ? clean(body.organizer)   : current.organizer,
    date_start:  body.date_start  !== undefined ? clean(body.date_start)  : current.date_start,
    date_end:    body.date_end    !== undefined ? clean(body.date_end)    : current.date_end,
    prize_pool:  body.prize_pool  !== undefined ? Number(body.prize_pool) : current.prize_pool,
    max_teams:   body.max_teams   !== undefined ? Number(body.max_teams)  : current.max_teams,
    status:      body.status      !== undefined ? normalizeStatus(body.status) : current.status,
    description: body.description !== undefined ? clean(body.description) : current.description,
    updatedAt:   new Date().toISOString(),
  };
  db.prepare(`
    UPDATE tournaments
    SET name=?,game=?,organizer=?,date_start=?,date_end=?,prize_pool=?,max_teams=?,status=?,description=?,updatedAt=?
    WHERE id=?
  `).run(updated.name, updated.game, updated.organizer, updated.date_start, updated.date_end,
         updated.prize_pool, updated.max_teams, updated.status, updated.description, updated.updatedAt, updated.id);
  return updated;
}

function deleteTournamentById(id) {
  const t = findTournamentById(id);
  if (!t) return null;
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(clean(id));
  return t;
}

// ── Estadísticas (PERFECTIVO) ────────────────────────────────
function getTournamentStats() {
  const total     = db.prepare('SELECT COUNT(*) AS n FROM tournaments').get().n;
  const upcoming  = db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE status='próximo'").get().n;
  const ongoing   = db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE status='en_curso'").get().n;
  const finished  = db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE status='finalizado'").get().n;
  const cancelled = db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE status='cancelado'").get().n;
  const totalPrize= db.prepare('SELECT COALESCE(SUM(prize_pool),0) AS s FROM tournaments').get().s;
  const byGame    = db.prepare('SELECT game, COUNT(*) AS n FROM tournaments GROUP BY game ORDER BY n DESC').all();
  return { total, upcoming, ongoing, finished, cancelled, totalPrize, byGame };
}

// ── Enviar evento al Hub ─────────────────────────────────────
async function sendEvent(action, tournament) {
  try {
    await axios.post(EVENT_MANAGER_URL, {
      source:      'EsportsTournamentManager',
      entity:      'Tournament',
      action:      action.toUpperCase(),
      title:       `[${action.toUpperCase()}] ${tournament.name || tournament.id || 'Tournament'}`,
      description: `Juego: ${tournament.game || 'system'} | Organizador: ${tournament.organizer || 'system'} | Estado: ${tournament.status || 'query'}`,
      payload:     tournament,
    }, { timeout: 4000 });
    logger.info('HUB', `Evento ${action} enviado`, { tournamentId: tournament.id });
    return true;
  } catch (error) {
    logger.warn('HUB', `Error enviando evento ${action}`, { error: error.message });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════════════════════

app.get('/',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Health — no requiere API Key (monitoreo)
app.get('/health', async (req, res) => {
  let hub;
  try {
    const r = await axios.get(EVENT_MANAGER_HEALTH_URL, { timeout: 2500 });
    hub = r.data?.status === 'ok' ? 'connected' : 'error';
  } catch {
    hub = 'offline';
  }
  logger.info('HEALTH', 'Health check ejecutado', { hub });
  res.json({
    status: 'ok', api: 'esports-crud',
    database: fs.existsSync(DB_PATH) ? 'connected' : 'not-found',
    hub, timestamp: new Date().toISOString(),
  });
});

// Lecturas — no requieren API Key
app.get('/tournaments/stats', (req, res) => {
  try {
    const stats = getTournamentStats();
    logger.info('STATS', 'Estadísticas consultadas', stats);
    res.json(stats);
  } catch (err) {
    logger.error('STATS', 'Error al obtener estadísticas', { error: err.message });
    res.status(500).json({ error: 'Error interno al obtener estadísticas' });
  }
});

app.get('/tournaments/games', (req, res) => res.json(ALLOWED_GAMES));

app.get('/tournaments', async (req, res) => {
  try {
    const errors = validateTournamentQuery(req.query);
    if (errors.length) {
      logger.warn('READ', 'Parámetros de consulta inválidos', { errors });
      return res.status(400).json({ error: errors.join(', ') });
    }

    const result = findTournaments(req.query);
    logger.info('READ', 'Consulta de torneos con filtros', result.pagination);
    await sendEvent('QUERY', {
      id: 'ALL', name: 'Consulta filtrada', game: 'system',
      organizer: 'system', status: 'query', total: result.pagination.total,
    });
    return res.json(result);
  } catch (err) {
    logger.error('READ', 'Error al consultar torneos', { error: err.message });
    return res.status(500).json({ error: 'Error interno al consultar torneos' });
  }
});

app.get('/tournaments/:id', async (req, res) => {
  // PREVENTIVO: sanitizar el ID antes de consultar
  const id = clean(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID de torneo inválido' });
  try {
    const t = findTournamentById(id);
    if (!t) {
      logger.warn('READ', `Torneo no encontrado: ${id}`);
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }
    logger.info('READ', `Torneo consultado: ${id}`, { name: t.name });
    await sendEvent('QUERY', t);
    return res.json(t);
  } catch (err) {
    logger.error('READ', `Error al consultar torneo ${id}`, { error: err.message });
    return res.status(500).json({ error: 'Error interno al consultar el torneo' });
  }
});

// ── Mutaciones protegidas con API Key (ADAPTATIVO) ───────────

app.post('/tournaments', requireApiKey, async (req, res) => {
  const errors = validateTournament(req.body);
  if (errors.length) {
    logger.warn('CREATE', 'Validación fallida', { errors });
    return res.status(400).json({ error: errors.join(', ') });
  }
  try {
    const t = insertTournament(req.body);
    logger.info('CREATE', `Torneo creado: ${t.id}`, { name: t.name, game: t.game });
    await sendEvent('CREATE', t);
    return res.status(201).json(t);
  } catch (err) {
    logger.error('CREATE', 'Error al insertar torneo', { error: err.message });
    return res.status(500).json({ error: 'Error interno al crear el torneo' });
  }
});

app.put('/tournaments/:id', requireApiKey, async (req, res) => {
  const id = clean(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID de torneo inválido' });

  const exists = findTournamentById(id);
  if (!exists) {
    logger.warn('UPDATE', `Torneo no encontrado para actualizar: ${id}`);
    return res.status(404).json({ error: 'Torneo no encontrado' });
  }

  const bodyErrors = validateUpdateBody(req.body);
  if (bodyErrors.length) {
    logger.warn('UPDATE', 'Cuerpo inválido en actualización', { errors: bodyErrors, id });
    return res.status(400).json({ error: bodyErrors.join(', ') });
  }

  const dateErrors = validateFinalDateRange(exists, req.body);
  if (dateErrors.length) {
    logger.warn('UPDATE', 'Rango de fechas inválido en actualización', { errors: dateErrors, id });
    return res.status(400).json({ error: dateErrors.join(', ') });
  }

  const errors = validateTournament(req.body, true);
  if (errors.length) {
    logger.warn('UPDATE', 'Validación fallida en actualización', { errors, id });
    return res.status(400).json({ error: errors.join(', ') });
  }

  try {
    const updated = updateTournament(id, req.body);
    logger.info('UPDATE', `Torneo actualizado: ${id}`, { name: updated.name });
    await sendEvent('UPDATE', updated);
    return res.json(updated);
  } catch (err) {
    logger.error('UPDATE', `Error al actualizar torneo ${id}`, { error: err.message });
    return res.status(500).json({ error: 'Error interno al actualizar el torneo' });
  }
});

app.delete('/tournaments/:id', requireApiKey, async (req, res) => {
  const id = clean(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID de torneo inválido' });
  try {
    const deleted = deleteTournamentById(id);
    if (!deleted) {
      logger.warn('DELETE', `Torneo no encontrado para eliminar: ${id}`);
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }
    logger.info('DELETE', `Torneo eliminado: ${id}`, { name: deleted.name });
    await sendEvent('DELETE', deleted);
    return res.json({ message: 'Torneo eliminado', tournament: deleted });
  } catch (err) {
    logger.error('DELETE', `Error al eliminar torneo ${id}`, { error: err.message });
    return res.status(500).json({ error: 'Error interno al eliminar el torneo' });
  }
});

// ── Arranque ─────────────────────────────────────────────────
function startServer() {
  return app.listen(PORT, () => {
    logger.info('STARTUP', `Esports CRUD iniciado en puerto ${PORT}`, {
      db: DB_PATH, hub: EVENT_MANAGER_URL,
    });
  });
}

if (require.main === module) startServer();

module.exports = {
  app, clean, normalizeStatus, validateTournament, validateTournamentQuery,
  getTournamentStats, buildTournamentWhere, findTournaments,
  findAllTournaments, findTournamentById, insertTournament, updateTournament,
  deleteTournamentById, startServer, ALLOWED_GAMES, ALLOWED_STATUS, ALLOWED_SORT_BY, logger,
  validateUpdateBody, validateFinalDateRange, VALID_UPDATE_FIELDS,
};