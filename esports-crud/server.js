const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const EVENT_MANAGER_URL = process.env.EVENT_MANAGER_URL || 'http://localhost:3000/events';
const EVENT_MANAGER_HEALTH_URL = process.env.EVENT_MANAGER_HEALTH_URL || 'http://localhost:3000/health';
const PORT = process.env.PORT || 4000;
const DB_DIR = path.join(__dirname, 'db');
const DB_PATH = process.env.ESPORTS_DB_PATH || path.join(DB_DIR, 'esports.sqlite');

// ── Valores permitidos ──
const ALLOWED_STATUS = ['próximo', 'en_curso', 'finalizado', 'cancelado'];
const ALLOWED_GAMES = [
  'League of Legends', 'Valorant', 'CS2', 'Dota 2',
  'Fortnite', 'Rocket League', 'FIFA', 'Street Fighter 6',
  'Apex Legends', 'Overwatch 2'
];

fs.mkdirSync(DB_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ── Migración / creación de tablas ──
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
}

migrateDatabase();

// ── Utilidades ──
function clean(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';       // ← Bug correctivo: evita "[object Object]"
  return String(value).trim();
}

function normalizeStatus(status) {
  const s = clean(status || 'próximo');
  return ALLOWED_STATUS.includes(s) ? s : 'próximo';
}

// ── Validación (Mantenimiento Preventivo) ──
function validateTournament(data, isUpdate = false) {
  const errors = [];

  const name        = clean(data.name);
  const game        = clean(data.game);
  const organizer   = clean(data.organizer);
  const dateStart   = clean(data.date_start);
  const dateEnd     = clean(data.date_end);
  const prizePool   = Number(data.prize_pool);
  const maxTeams    = Number(data.max_teams);
  const status      = clean(data.status || 'próximo');

  if (!isUpdate || data.name !== undefined) {
    if (!name)              errors.push('name es obligatorio');
    if (name.length > 80)  errors.push('name no puede superar 80 caracteres');
  }

  if (!isUpdate || data.game !== undefined) {
    if (!game)                          errors.push('game es obligatorio');
    if (!ALLOWED_GAMES.includes(game))  errors.push(`game debe ser uno de: ${ALLOWED_GAMES.join(', ')}`);
  }

  if (!isUpdate || data.organizer !== undefined) {
    if (!organizer)             errors.push('organizer es obligatorio');
    if (organizer.length > 60)  errors.push('organizer no puede superar 60 caracteres');
  }

  if (!isUpdate || data.date_start !== undefined) {
    if (!dateStart)                         errors.push('date_start es obligatorio');
    if (dateStart && isNaN(Date.parse(dateStart))) errors.push('date_start debe ser fecha válida (ISO)');
  }

  if (!isUpdate || data.date_end !== undefined) {
    if (!dateEnd)                         errors.push('date_end es obligatorio');
    if (dateEnd && isNaN(Date.parse(dateEnd))) errors.push('date_end debe ser fecha válida (ISO)');
  }

  // Mantenimiento Adaptativo: validar que fecha fin > fecha inicio
  if (dateStart && dateEnd && !isNaN(Date.parse(dateStart)) && !isNaN(Date.parse(dateEnd))) {
    if (new Date(dateEnd) <= new Date(dateStart)) {
      errors.push('date_end debe ser posterior a date_start');
    }
  }

  if (data.prize_pool !== undefined && (isNaN(prizePool) || prizePool < 0)) {
    errors.push('prize_pool debe ser un número positivo');
  }

  if (data.max_teams !== undefined && (isNaN(maxTeams) || maxTeams < 2 || maxTeams > 256)) {
    errors.push('max_teams debe estar entre 2 y 256');
  }

  if (data.status !== undefined && !ALLOWED_STATUS.includes(status)) {
    errors.push(`status inválido. Opciones: ${ALLOWED_STATUS.join(', ')}`);
  }

  if (clean(data.description).length > 400) {
    errors.push('description no puede superar 400 caracteres');
  }

  return errors;
}

// ── IDs ──
function nextTournamentId() {
  const row = db
    .prepare("SELECT id FROM tournaments WHERE id LIKE 'TRN-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1")
    .get();
  const last = row ? Number(String(row.id).replace('TRN-', '')) : 0;
  return `TRN-${String(last + 1).padStart(4, '0')}`;
}

// ── Mapeo de fila ──
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

// ── CRUD DB ──
function findAllTournaments() {
  return db.prepare('SELECT * FROM tournaments ORDER BY createdAt DESC').all().map(mapTournament);
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
    INSERT INTO tournaments (id, name, game, organizer, date_start, date_end, prize_pool, max_teams, status, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(t.id, t.name, t.game, t.organizer, t.date_start, t.date_end, t.prize_pool, t.max_teams, t.status, t.description, t.createdAt, t.updatedAt);

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
    SET name=?, game=?, organizer=?, date_start=?, date_end=?, prize_pool=?, max_teams=?, status=?, description=?, updatedAt=?
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

// ── Estadísticas (Mantenimiento Perfectivo) ──
function getTournamentStats() {
  const total      = db.prepare('SELECT COUNT(*) AS n FROM tournaments').get().n;
  const upcoming   = db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE status='próximo'").get().n;
  const ongoing    = db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE status='en_curso'").get().n;
  const finished   = db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE status='finalizado'").get().n;
  const cancelled  = db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE status='cancelado'").get().n;
  const totalPrize = db.prepare('SELECT COALESCE(SUM(prize_pool),0) AS s FROM tournaments').get().s;
  const byGame     = db.prepare('SELECT game, COUNT(*) AS n FROM tournaments GROUP BY game ORDER BY n DESC').all();

  return { total, upcoming, ongoing, finished, cancelled, totalPrize, byGame };
}

// ── Enviar evento al Hub ──
async function sendEvent(action, tournament) {
  try {
    await axios.post(
      EVENT_MANAGER_URL,
      {
        source:      'EsportsTournamentManager',
        entity:      'Tournament',
        action:      action.toUpperCase(),
        title:       `[${action.toUpperCase()}] ${tournament.name || tournament.id || 'Tournament'}`,
        description: `Juego: ${tournament.game || 'system'} | Organizador: ${tournament.organizer || 'system'} | Estado: ${tournament.status || 'query'}`,
        payload:     tournament,
      },
      { timeout: 4000 },
    );
    console.log(`✅ Evento ${action} enviado al Hub`);
    return true;
  } catch (error) {
    console.error(`❌ Error enviando evento ${action}:`, error.message);
    return false;
  }
}

// ── Rutas ──
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/health', async (req, res) => {
  let hub;
  try {
    const r = await axios.get(EVENT_MANAGER_HEALTH_URL, { timeout: 2500 });
    hub = r.data?.status === 'ok' ? 'connected' : 'error';
  } catch {
    hub = 'offline';
  }
  res.json({
    status: 'ok', api: 'esports-crud',
    database: fs.existsSync(DB_PATH) ? 'connected' : 'not-found',
    hub, timestamp: new Date().toISOString(),
  });
});

app.get('/tournaments/stats', (req, res) => res.json(getTournamentStats()));

app.get('/tournaments/games', (req, res) => res.json(ALLOWED_GAMES));

app.get('/tournaments', async (req, res) => {
  const list = findAllTournaments();
  await sendEvent('QUERY', { id: 'ALL', name: 'Consulta general', game: 'system', organizer: 'system', status: 'query', total: list.length });
  return res.json(list);
});

app.get('/tournaments/:id', async (req, res) => {
  const t = findTournamentById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
  await sendEvent('QUERY', t);
  return res.json(t);
});

app.post('/tournaments', async (req, res) => {
  const errors = validateTournament(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  try {
    const t = insertTournament(req.body);
    await sendEvent('CREATE', t);
    return res.status(201).json(t);
  } catch (err) {
    console.error('Error al insertar torneo:', err.message);
    return res.status(500).json({ error: 'Error interno al crear el torneo' });
  }
});

app.put('/tournaments/:id', async (req, res) => {
  const exists = findTournamentById(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Torneo no encontrado' });

  const errors = validateTournament(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  try {
    const updated = updateTournament(req.params.id, req.body);
    await sendEvent('UPDATE', updated);
    return res.json(updated);
  } catch (err) {
    console.error('Error al actualizar torneo:', err.message);
    return res.status(500).json({ error: 'Error interno al actualizar el torneo' });
  }
});

app.delete('/tournaments/:id', async (req, res) => {
  try {
    const deleted = deleteTournamentById(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Torneo no encontrado' });
    await sendEvent('DELETE', deleted);
    return res.json({ message: 'Torneo eliminado', tournament: deleted });
  } catch (err) {
    console.error('Error al eliminar torneo:', err.message);
    return res.status(500).json({ error: 'Error interno al eliminar el torneo' });
  }
});

// ── Arranque ──
function startServer() {
  return app.listen(PORT, () => {
    console.log(`🎮 Esports Tournament Manager corriendo en http://localhost:${PORT}`);
    console.log(`🗄️  Base de datos: ${DB_PATH}`);
    console.log('📡 Enviando eventos al Event Manager en http://localhost:3000');
  });
}

if (require.main === module) startServer();

module.exports = {
  app, clean, normalizeStatus, validateTournament, getTournamentStats,
  findAllTournaments, findTournamentById, insertTournament, updateTournament,
  deleteTournamentById, startServer, ALLOWED_GAMES, ALLOWED_STATUS,
};