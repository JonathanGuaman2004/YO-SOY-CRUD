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
const PORT    = process.env.PORT     || 4003;
const DB_DIR  = path.join(__dirname, 'db');
const DB_PATH = process.env.AUDIO_DB_PATH || path.join(DB_DIR, 'audiohub.sqlite');

const ALLOWED_TYPES = ['cancion', 'podcast'];

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ── Migración / creación de tabla ──────────────────────────────────────────

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
}

migrateDatabase();

// ── Utilidades ─────────────────────────────────────────────────────────────

function clean(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value).trim();
}

function normalizeTipo(tipo) {
  const t = clean(tipo).toLowerCase();
  return ALLOWED_TYPES.includes(t) ? t : 'cancion';
}

// ── Validación ─────────────────────────────────────────────────────────────

function validateAudio(data, isUpdate = false) {
  const errors = [];

  const titulo = clean(data.titulo);
  const autor  = clean(data.autor);
  const tipo   = clean(data.tipo).toLowerCase();

  if (!isUpdate || data.titulo !== undefined) {
    if (!titulo)             errors.push('titulo es obligatorio');
    if (titulo.length > 120) errors.push('titulo no puede superar 120 caracteres');
  }

  if (!isUpdate || data.autor !== undefined) {
    if (!autor)             errors.push('autor es obligatorio');
    if (autor.length > 80)  errors.push('autor no puede superar 80 caracteres');
  }

  if (!isUpdate || data.tipo !== undefined) {
    if (!tipo)                           errors.push('tipo es obligatorio');
    if (!ALLOWED_TYPES.includes(tipo))   errors.push(`tipo debe ser uno de: ${ALLOWED_TYPES.join(', ')}`);
  }

  return errors;
}

// ── IDs ─────────────────────────────────────────────────────────────────────

function nextAudioId() {
  const row = db
    .prepare("SELECT id FROM audios WHERE id LIKE 'AUD-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1")
    .get();
  const last = row ? Number(String(row.id).replace('AUD-', '')) : 0;
  return `AUD-${String(last + 1).padStart(4, '0')}`;
}

// ── Mapeo de fila ───────────────────────────────────────────────────────────

function mapAudio(row) {
  return {
    id:        row.id,
    tipo:      row.tipo,
    titulo:    row.titulo,
    autor:     row.autor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── CRUD DB ─────────────────────────────────────────────────────────────────

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

  db.prepare(`
    INSERT INTO audios (id, tipo, titulo, autor, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(audio.id, audio.tipo, audio.titulo, audio.autor, audio.createdAt, audio.updatedAt);

  return audio;
}

function updateAudio(id, body) {
  const current = findAudioById(id);
  if (!current) return null;

  const updated = {
    ...current,
    tipo:      body.tipo   !== undefined ? normalizeTipo(body.tipo)  : current.tipo,
    titulo:    body.titulo !== undefined ? clean(body.titulo)         : current.titulo,
    autor:     body.autor  !== undefined ? clean(body.autor)          : current.autor,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE audios
    SET tipo = ?, titulo = ?, autor = ?, updatedAt = ?
    WHERE id = ?
  `).run(updated.tipo, updated.titulo, updated.autor, updated.updatedAt, updated.id);

  return updated;
}

function deleteAudioById(id) {
  const audio = findAudioById(id);
  if (!audio) return null;
  db.prepare('DELETE FROM audios WHERE id = ?').run(clean(id));
  return audio;
}

// ── Estadísticas ─────────────────────────────────────────────────────────────

function getAudioStats() {
  const total    = db.prepare('SELECT COUNT(*) AS n FROM audios').get().n;
  const canciones = db.prepare("SELECT COUNT(*) AS n FROM audios WHERE tipo = 'cancion'").get().n;
  const podcasts  = db.prepare("SELECT COUNT(*) AS n FROM audios WHERE tipo = 'podcast'").get().n;
  const byAutor   = db.prepare('SELECT autor, COUNT(*) AS n FROM audios GROUP BY autor ORDER BY n DESC LIMIT 5').all();

  return { total, canciones, podcasts, byAutor };
}

// ── Enviar evento al Event Manager ───────────────────────────────────────────

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
    console.log(`✅ Evento ${action} enviado al Event Manager`);
    return true;
  } catch (error) {
    console.error(`❌ Error enviando evento ${action}:`, error.message);
    return false;
  }
}

// ── Rutas ─────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', async (req, res) => {
  let hub;
  try {
    const response = await axios.get(EVENT_MANAGER_HEALTH_URL, { timeout: 2500 });
    hub = response.data?.status === 'ok' ? 'connected' : 'error';
  } catch {
    hub = 'offline';
  }

  res.json({
    status:       'ok',
    api:          'audiohub-crud',
    database:     fs.existsSync(DB_PATH) ? 'connected' : 'not-found',
    databasePath: DB_PATH,
    hub,
    timestamp:    new Date().toISOString(),
  });
});

app.get('/audios/stats', (req, res) => {
  res.json(getAudioStats());
});

app.get('/audios/types', (req, res) => {
  res.json(ALLOWED_TYPES);
});

app.get('/audios', async (req, res) => {
  const list = findAllAudios();

  await sendEvent('QUERY', {
    id:     'ALL',
    tipo:   'system',
    titulo: 'Consulta general de audios',
    autor:  'system',
    total:  list.length,
  });

  return res.json(list);
});

app.get('/audios/:id', async (req, res) => {
  const audio = findAudioById(req.params.id);
  if (!audio) return res.status(404).json({ error: 'Audio no encontrado' });

  await sendEvent('QUERY', audio);
  return res.json(audio);
});

app.post('/audios', async (req, res) => {
  const errors = validateAudio(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  try {
    const audio = insertAudio(req.body);
    await sendEvent('CREATE', audio);
    return res.status(201).json(audio);
  } catch (err) {
    console.error('Error al insertar audio:', err.message);
    return res.status(500).json({ error: 'Error interno al crear el audio' });
  }
});

app.put('/audios/:id', async (req, res) => {
  const exists = findAudioById(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Audio no encontrado' });

  const errors = validateAudio(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  try {
    const updated = updateAudio(req.params.id, req.body);
    await sendEvent('UPDATE', updated);
    return res.json(updated);
  } catch (err) {
    console.error('Error al actualizar audio:', err.message);
    return res.status(500).json({ error: 'Error interno al actualizar el audio' });
  }
});

app.delete('/audios/:id', async (req, res) => {
  try {
    const deleted = deleteAudioById(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Audio no encontrado' });

    await sendEvent('DELETE', deleted);
    return res.json({ message: 'Audio eliminado', audio: deleted });
  } catch (err) {
    console.error('Error al eliminar audio:', err.message);
    return res.status(500).json({ error: 'Error interno al eliminar el audio' });
  }
});

// ── Arranque ──────────────────────────────────────────────────────────────────

function startServer() {
  return app.listen(PORT, () => {
    console.log(`🎵 AudioHub corriendo en http://localhost:${PORT}`);
    console.log(`🗄️  Base de datos: ${DB_PATH}`);
    console.log('📡 Enviando eventos al Event Manager en http://localhost:3000');
  });
}

if (require.main === module) startServer();

module.exports = {
  app,
  clean,
  normalizeTipo,
  validateAudio,
  getAudioStats,
  findAllAudios,
  findAudioById,
  insertAudio,
  updateAudio,
  deleteAudioById,
  startServer,
  ALLOWED_TYPES,
};
