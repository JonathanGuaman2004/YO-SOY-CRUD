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
const DB_PATH = process.env.MISSIONS_DB_PATH || path.join(DB_DIR, 'missions.sqlite');

const allowedStatus = ['planned', 'active', 'completed', 'failed', 'aborted'];

fs.mkdirSync(DB_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function migrateDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agency TEXT NOT NULL,
      type TEXT NOT NULL,
      vehicle TEXT,
      date TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      crew TEXT,
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
    CREATE INDEX IF NOT EXISTS idx_missions_agency ON missions(agency);
  `);
}

migrateDatabase();

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeStatus(status) {
  const cleanStatus = clean(status || 'planned');
  return allowedStatus.includes(cleanStatus) ? cleanStatus : 'planned';
}

function validateMission(data, isUpdate = false) {
  const errors = [];
  const name = clean(data.name);
  const agency = clean(data.agency);
  const type = clean(data.type);
  const status = clean(data.status || 'planned');
  const launchDate = clean(data.date);

  if (!isUpdate || data.name !== undefined) {
    if (!name) errors.push('name es obligatorio');
    if (name.length > 80) errors.push('name no puede superar 80 caracteres');
  }

  if (!isUpdate || data.agency !== undefined) {
    if (!agency) errors.push('agency es obligatorio');
    if (agency.length > 60) errors.push('agency no puede superar 60 caracteres');
  }

  if (!isUpdate || data.type !== undefined) {
    if (!type) errors.push('type es obligatorio');
    if (type.length > 60) errors.push('type no puede superar 60 caracteres');
  }

  if (data.status !== undefined && !allowedStatus.includes(status)) {
    errors.push('status inválido');
  }

  if (launchDate && Number.isNaN(Date.parse(launchDate))) {
    errors.push('date debe tener un formato válido');
  }

  if (clean(data.vehicle).length > 60) errors.push('vehicle no puede superar 60 caracteres');
  if (clean(data.crew).length > 120) errors.push('crew no puede superar 120 caracteres');
  if (clean(data.description).length > 300) errors.push('description no puede superar 300 caracteres');

  return errors;
}

function nextMissionId() {
  const row = db
    .prepare("SELECT id FROM missions WHERE id LIKE 'MSN-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1")
    .get();
  const lastNumber = row ? Number(String(row.id).replace('MSN-', '')) : 0;
  return `MSN-${String(lastNumber + 1).padStart(4, '0')}`;
}

function mapMission(row) {
  return {
    id: row.id,
    name: row.name,
    agency: row.agency,
    type: row.type,
    vehicle: row.vehicle || '',
    date: row.date || '',
    status: row.status,
    crew: row.crew || '',
    description: row.description || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function findAllMissions() {
  return db.prepare('SELECT * FROM missions ORDER BY createdAt DESC').all().map(mapMission);
}

function findMissionById(id) {
  const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(clean(id));
  return row ? mapMission(row) : null;
}

function insertMission(body) {
  const now = new Date().toISOString();
  const mission = {
    id: nextMissionId(),
    name: clean(body.name),
    agency: clean(body.agency),
    type: clean(body.type),
    vehicle: clean(body.vehicle),
    date: clean(body.date),
    status: normalizeStatus(body.status),
    crew: clean(body.crew),
    description: clean(body.description),
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO missions (id, name, agency, type, vehicle, date, status, crew, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    mission.id,
    mission.name,
    mission.agency,
    mission.type,
    mission.vehicle,
    mission.date,
    mission.status,
    mission.crew,
    mission.description,
    mission.createdAt,
    mission.updatedAt,
  );

  return mission;
}

function updateMission(id, body) {
  const current = findMissionById(id);
  if (!current) return null;

  const updated = {
    ...current,
    name: body.name !== undefined ? clean(body.name) : current.name,
    agency: body.agency !== undefined ? clean(body.agency) : current.agency,
    type: body.type !== undefined ? clean(body.type) : current.type,
    vehicle: body.vehicle !== undefined ? clean(body.vehicle) : current.vehicle,
    date: body.date !== undefined ? clean(body.date) : current.date,
    status: body.status !== undefined ? normalizeStatus(body.status) : current.status,
    crew: body.crew !== undefined ? clean(body.crew) : current.crew,
    description: body.description !== undefined ? clean(body.description) : current.description,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE missions
    SET name = ?,
        agency = ?,
        type = ?,
        vehicle = ?,
        date = ?,
        status = ?,
        crew = ?,
        description = ?,
        updatedAt = ?
    WHERE id = ?
  `).run(
    updated.name,
    updated.agency,
    updated.type,
    updated.vehicle,
    updated.date,
    updated.status,
    updated.crew,
    updated.description,
    updated.updatedAt,
    updated.id,
  );

  return updated;
}

function deleteMissionById(id) {
  const mission = findMissionById(id);
  if (!mission) return null;
  db.prepare('DELETE FROM missions WHERE id = ?').run(clean(id));
  return mission;
}

function getMissionStats() {
  const total = db.prepare('SELECT COUNT(*) AS total FROM missions').get().total;
  const active = db.prepare("SELECT COUNT(*) AS total FROM missions WHERE status = 'active'").get().total;
  const completed = db.prepare("SELECT COUNT(*) AS total FROM missions WHERE status = 'completed'").get().total;
  const failed = db
    .prepare("SELECT COUNT(*) AS total FROM missions WHERE status IN ('failed', 'aborted')")
    .get().total;

  return { total, active, completed, failedOrAborted: failed };
}

async function sendEvent(action, mission) {
  try {
    await axios.post(
      EVENT_MANAGER_URL,
      {
        source: 'SpaceMissionControl',
        entity: 'Mission',
        action: action.toUpperCase(),
        title: `[${action.toUpperCase()}] ${mission.name || mission.id || 'Mission'}`,
        description: `Agencia: ${mission.agency || 'system'} | Tipo: ${mission.type || 'query'} | Estado: ${mission.status || 'query'}`,
        payload: mission,
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
    status: 'ok',
    api: 'missions-crud',
    database: fs.existsSync(DB_PATH) ? 'connected' : 'not-found',
    databasePath: DB_PATH,
    hub,
    timestamp: new Date().toISOString(),
  });
});

app.get('/missions/stats', (req, res) => {
  res.json(getMissionStats());
});

app.post('/missions', async (req, res) => {
  const errors = validateMission(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const mission = insertMission(req.body);
  await sendEvent('CREATE', mission);
  return res.status(201).json(mission);
});

app.get('/missions', async (req, res) => {
  const missions = findAllMissions();
  await sendEvent('QUERY', {
    id: 'ALL',
    name: 'Consulta general de misiones',
    agency: 'system',
    type: 'query',
    status: 'query',
    total: missions.length,
  });
  return res.json(missions);
});

app.get('/missions/:id', async (req, res) => {
  const mission = findMissionById(req.params.id);
  if (!mission) return res.status(404).json({ error: 'Misión no encontrada' });
  await sendEvent('QUERY', mission);
  return res.json(mission);
});

app.put('/missions/:id', async (req, res) => {
  const exists = findMissionById(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Misión no encontrada' });

  const errors = validateMission(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const updated = updateMission(req.params.id, req.body);
  await sendEvent('UPDATE', updated);
  return res.json(updated);
});

app.delete('/missions/:id', async (req, res) => {
  const deleted = deleteMissionById(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Misión no encontrada' });

  await sendEvent('DELETE', deleted);
  return res.json({ message: 'Misión eliminada', mission: deleted });
});

function startServer() {
  return app.listen(PORT, () => {
    console.log(`🚀 Space Mission Control corriendo en http://localhost:${PORT}`);
    console.log(`🗄️  Base de datos CRUD: ${DB_PATH}`);
    console.log('📡 Enviando eventos al Event Manager en http://localhost:3000');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  clean,
  normalizeStatus,
  validateMission,
  getMissionStats,
  findAllMissions,
  findMissionById,
  insertMission,
  updateMission,
  deleteMissionById,
  startServer,
};
