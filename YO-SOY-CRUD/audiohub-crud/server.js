const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const EVENT_MANAGER_URL        = process.env.EVENT_MANAGER_URL        || 'http://localhost:3000/events';
const EVENT_MANAGER_HEALTH_URL = process.env.EVENT_MANAGER_HEALTH_URL || 'http://localhost:3000/health';
const PORT      = process.env.PORT           || 4003;
const DB_DIR    = path.join(__dirname, 'db');
const DB_PATH   = process.env.AUDIO_DB_PATH  || path.join(DB_DIR, 'audiohub.sqlite');
const API_KEY   = process.env.FIS_EPN_KEY    || 'audiohub-2026';
const LOG_DIR   = path.join(__dirname, 'logs');
const LOG_PATH  = path.join(LOG_DIR, 'audiohub.log');

const ALLOWED_TYPES = ['cancion', 'podcast'];

fs.mkdirSync(DB_DIR,  { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

// ── Logger estructurado (ISO 8601) ────────────────────────────────────────────
// Cumple: "registre niveles de severidad INFO, WARN, ERROR con marca de tiempo"

function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service:   'audiohub-crud',
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch {}
}

const logger = {
  info:  (msg, meta) => log('INFO',  msg, meta),
  warn:  (msg, meta) => log('WARN',  msg, meta),
  error: (msg, meta) => log('ERROR', msg, meta),
};

// ── Middleware: API Key (X-FIS-EPN-KEY) ───────────────────────────────────────
// Cumple: "restringir endpoints con cabecera personalizada X-FIS-EPN-KEY"
// Exenta: GET / y GET /health para que el frontend pueda cargar sin llave

function requireApiKey(req, res, next) {
  const key = req.headers['x-fis-epn-key'];
  if (!key) {
    logger.warn('Petición sin API Key rechazada', { method: req.method, url: req.originalUrl, ip: req.ip });
    return res.status(401).json({ error: 'API Key requerida. Incluye el header X-FIS-EPN-KEY.' });
  }
  if (key !== API_KEY) {
    logger.warn('API Key inválida', { method: req.method, url: req.originalUrl, ip: req.ip });
    return res.status(403).json({ error: 'API Key inválida.' });
  }
  next();
}

// ── Middleware: Log de cada petición ──────────────────────────────────────────

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('HTTP Request', {
      method:   req.method,
      url:      req.originalUrl,
      status:   res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});

// ── Base de datos ─────────────────────────────────────────────────────────────

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function migrateDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audios (
      id        TEXT PRIMARY KEY,
      tipo      TEXT NOT NULL,
      titulo    TEXT NOT NULL,
      autor     TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audios_tipo  ON audios(tipo);
    CREATE INDEX IF NOT EXISTS idx_audios_autor ON audios(autor);
  `);
  logger.info('Base de datos inicializada', { path: DB_PATH });
}

migrateDatabase();

// ── Utilidades ────────────────────────────────────────────────────────────────

function clean(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value).trim();
}

function normalizeTipo(tipo) {
  const t = clean(tipo).toLowerCase();
  return ALLOWED_TYPES.includes(t) ? t : 'cancion';
}

// ── Validación (Mantenimiento Preventivo) ─────────────────────────────────────

function validateAudio(data, isUpdate = false) {
  const errors = [];
  const titulo = clean(data.titulo);
  const autor  = clean(data.autor);
  const tipo   = clean(data.tipo).toLowerCase();

  if (!isUpdate || data.titulo !== undefined) {
    if (!titulo)              errors.push('titulo es obligatorio');
    if (titulo.length > 120)  errors.push('titulo no puede superar 120 caracteres');
  }
  if (!isUpdate || data.autor !== undefined) {
    if (!autor)              errors.push('autor es obligatorio');
    if (autor.length > 80)   errors.push('autor no puede superar 80 caracteres');
  }
  if (!isUpdate || data.tipo !== undefined) {
    if (!tipo)                          errors.push('tipo es obligatorio');
    if (!ALLOWED_TYPES.includes(tipo))  errors.push(`tipo debe ser uno de: ${ALLOWED_TYPES.join(', ')}`);
  }
  return errors;
}

// ── IDs ───────────────────────────────────────────────────────────────────────

function nextAudioId() {
  const row = db
    .prepare("SELECT id FROM audios WHERE id LIKE 'AUD-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1")
    .get();
  const last = row ? Number(String(row.id).replace('AUD-', '')) : 0;
  return `AUD-${String(last + 1).padStart(4, '0')}`;
}

// ── Mapeo de fila ─────────────────────────────────────────────────────────────

function mapAudio(row) {
  return { id: row.id, tipo: row.tipo, titulo: row.titulo, autor: row.autor, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

// ── CRUD DB ───────────────────────────────────────────────────────────────────

function findAllAudios() {
  return db.prepare('SELECT * FROM audios ORDER BY createdAt DESC').all().map(mapAudio);
}

function findAudioById(id) {
  const row = db.prepare('SELECT * FROM audios WHERE id = ?').get(clean(id));
  return row ? mapAudio(row) : null;
}

function insertAudio(body) {
  const now = new Date().toISOString();
  const audio = {
    id:        nextAudioId(),
    tipo:      normalizeTipo(body.tipo),
    titulo:    clean(body.titulo),
    autor:     clean(body.autor),
    createdAt: now,
    updatedAt: now,
  };
  db.prepare('INSERT INTO audios (id, tipo, titulo, autor, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(audio.id, audio.tipo, audio.titulo, audio.autor, audio.createdAt, audio.updatedAt);
  return audio;
}

function updateAudio(id, body) {
  const current = findAudioById(id);
  if (!current) return null;
  const updated = {
    ...current,
    tipo:      body.tipo   !== undefined ? normalizeTipo(body.tipo) : current.tipo,
    titulo:    body.titulo !== undefined ? clean(body.titulo)        : current.titulo,
    autor:     body.autor  !== undefined ? clean(body.autor)         : current.autor,
    updatedAt: new Date().toISOString(),
  };
  db.prepare('UPDATE audios SET tipo = ?, titulo = ?, autor = ?, updatedAt = ? WHERE id = ?')
    .run(updated.tipo, updated.titulo, updated.autor, updated.updatedAt, updated.id);
  return updated;
}

function deleteAudioById(id) {
  const audio = findAudioById(id);
  if (!audio) return null;
  db.prepare('DELETE FROM audios WHERE id = ?').run(clean(id));
  return audio;
}

// ── Estadísticas (Mantenimiento Perfectivo) ───────────────────────────────────

function getAudioStats() {
  const total     = db.prepare('SELECT COUNT(*) AS n FROM audios').get().n;
  const canciones = db.prepare("SELECT COUNT(*) AS n FROM audios WHERE tipo = 'cancion'").get().n;
  const podcasts  = db.prepare("SELECT COUNT(*) AS n FROM audios WHERE tipo = 'podcast'").get().n;
  const byAutor   = db.prepare('SELECT autor, COUNT(*) AS n FROM audios GROUP BY autor ORDER BY n DESC LIMIT 5').all();
  return { total, canciones, podcasts, byAutor };
}

// ── Enviar evento al Event Manager ────────────────────────────────────────────

async function sendEvent(action, audio) {
  try {
    await axios.post(
      EVENT_MANAGER_URL,
      {
        source:      'audiohub-frontend',
        entity:      audio.tipo || 'Audio',
        action:      action.toUpperCase(),
        title:       `[${action.toUpperCase()}] ${audio.titulo || audio.id || 'Audio'}`,
        description: `Tipo: ${audio.tipo || 'sistema'} | Autor: ${audio.autor || 'sistema'}`,
        payload:     audio,
      },
      { timeout: 4000 },
    );
    logger.info(`Evento enviado al Event Manager`, { action, audioId: audio.id });
    return true;
  } catch (error) {
    logger.error(`Error enviando evento al Event Manager`, { action, error: error.message });
    return false;
  }
}

// ── Rutas públicas (sin API Key) ──────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', async (req, res) => {
  let hub;
  try {
    const r = await axios.get(EVENT_MANAGER_HEALTH_URL, { timeout: 2500 });
    hub = r.data?.status === 'ok' ? 'connected' : 'error';
  } catch {
    hub = 'offline';
  }
  logger.info('Health check consultado', { hub });
  res.json({
    status: 'ok', api: 'audiohub-crud',
    database: fs.existsSync(DB_PATH) ? 'connected' : 'not-found',
    databasePath: DB_PATH, hub,
    timestamp: new Date().toISOString(),
  });
});

// ── Rutas protegidas (requieren X-FIS-EPN-KEY) ────────────────────────────────

app.get('/audios/stats', requireApiKey, (req, res) => {
  const stats = getAudioStats();
  logger.info('Estadísticas consultadas', stats);
  res.json(stats);
});

app.get('/audios/types', requireApiKey, (req, res) => {
  res.json(ALLOWED_TYPES);
});

app.get('/audios', requireApiKey, async (req, res) => {
  const list = findAllAudios();
  logger.info('Consulta general de audios', { total: list.length });
  await sendEvent('QUERY', { id: 'ALL', tipo: 'system', titulo: 'Consulta general', autor: 'system', total: list.length });
  return res.json(list);
});

app.get('/audios/:id', requireApiKey, async (req, res) => {
  const audio = findAudioById(req.params.id);
  if (!audio) {
    logger.warn('Audio no encontrado', { id: req.params.id });
    return res.status(404).json({ error: 'Audio no encontrado' });
  }
  logger.info('Audio consultado', { id: audio.id });
  await sendEvent('QUERY', audio);
  return res.json(audio);
});

app.post('/audios', requireApiKey, async (req, res) => {
  const errors = validateAudio(req.body);
  if (errors.length) {
    logger.warn('Validación fallida en CREATE', { errors, body: req.body });
    return res.status(400).json({ error: errors.join(', ') });
  }
  try {
    const audio = insertAudio(req.body);
    logger.info('Audio creado', { id: audio.id, titulo: audio.titulo, autor: audio.autor });
    await sendEvent('CREATE', audio);
    return res.status(201).json(audio);
  } catch (err) {
    logger.error('Error interno al crear audio', { error: err.message });
    return res.status(500).json({ error: 'Error interno al crear el audio' });
  }
});

app.put('/audios/:id', requireApiKey, async (req, res) => {
  const exists = findAudioById(req.params.id);
  if (!exists) {
    logger.warn('Audio no encontrado para UPDATE', { id: req.params.id });
    return res.status(404).json({ error: 'Audio no encontrado' });
  }
  const errors = validateAudio(req.body, true);
  if (errors.length) {
    logger.warn('Validación fallida en UPDATE', { errors, id: req.params.id });
    return res.status(400).json({ error: errors.join(', ') });
  }
  try {
    const updated = updateAudio(req.params.id, req.body);
    logger.info('Audio actualizado', { id: updated.id, titulo: updated.titulo });
    await sendEvent('UPDATE', updated);
    return res.json(updated);
  } catch (err) {
    logger.error('Error interno al actualizar audio', { error: err.message });
    return res.status(500).json({ error: 'Error interno al actualizar el audio' });
  }
});

app.delete('/audios/:id', requireApiKey, async (req, res) => {
  try {
    const deleted = deleteAudioById(req.params.id);
    if (!deleted) {
      logger.warn('Audio no encontrado para DELETE', { id: req.params.id });
      return res.status(404).json({ error: 'Audio no encontrado' });
    }
    logger.info('Audio eliminado', { id: deleted.id, titulo: deleted.titulo });
    await sendEvent('DELETE', deleted);
    return res.json({ message: 'Audio eliminado', audio: deleted });
  } catch (err) {
    logger.error('Error interno al eliminar audio', { error: err.message });
    return res.status(500).json({ error: 'Error interno al eliminar el audio' });
  }
});

// ── Arranque ──────────────────────────────────────────────────────────────────

function startServer() {
  return app.listen(PORT, () => {
    logger.info('Servidor iniciado', { port: PORT, database: DB_PATH, logFile: LOG_PATH });
    console.log(`🎵 AudioHub corriendo en http://localhost:${PORT}`);
    console.log(`🗄️  Base de datos: ${DB_PATH}`);
    console.log(`📋 Logs: ${LOG_PATH}`);
    console.log(`🔑 API Key activa: X-FIS-EPN-KEY: ${API_KEY}`);
    console.log('📡 Enviando eventos al Event Manager en http://localhost:3000');
  });
}

if (require.main === module) startServer();

module.exports = {
  app, clean, normalizeTipo, validateAudio, getAudioStats,
  findAllAudios, findAudioById, insertAudio, updateAudio,
  deleteAudioById, startServer, ALLOWED_TYPES, requireApiKey,
};
