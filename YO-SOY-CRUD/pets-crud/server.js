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

const PORT = process.env.PORT || 4002;

const DB_DIR = path.join(__dirname, 'db');
const DB_PATH = process.env.PETS_DB_PATH || path.join(DB_DIR, 'pets.sqlite');

const allowedSpecies = ['perro', 'gato', 'ave', 'conejo', 'hamster', 'pez', 'otro'];
const allowedStatus = ['activo', 'en_tratamiento', 'adoptado', 'perdido', 'inactivo'];

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function migrateDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      species TEXT NOT NULL,
      breed TEXT,
      age INTEGER,
      owner TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'activo',
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pets_species ON pets(species);
    CREATE INDEX IF NOT EXISTS idx_pets_status ON pets(status);
    CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner);
  `);
}

migrateDatabase();

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeSpecies(species) {
  const value = clean(species).toLowerCase();
  return allowedSpecies.includes(value) ? value : 'otro';
}

function normalizeStatus(status) {
  const value = clean(status || 'activo').toLowerCase();
  return allowedStatus.includes(value) ? value : 'activo';
}

function validatePet(data, isUpdate = false) {
  const errors = [];

  const name = clean(data.name);
  const species = clean(data.species).toLowerCase();
  const owner = clean(data.owner);
  const phone = clean(data.phone);
  const breed = clean(data.breed);
  const description = clean(data.description);
  const status = clean(data.status || 'activo').toLowerCase();

  if (!isUpdate || data.name !== undefined) {
    if (!name) errors.push('name es obligatorio');
    if (name.length > 80) errors.push('name no puede superar 80 caracteres');
  }

  if (!isUpdate || data.species !== undefined) {
    if (!species) errors.push('species es obligatorio');
    if (!allowedSpecies.includes(species)) {
      errors.push('species inválida');
    }
  }

  if (!isUpdate || data.owner !== undefined) {
    if (!owner) errors.push('owner es obligatorio');
    if (owner.length > 80) errors.push('owner no puede superar 80 caracteres');
  }

  if (data.age !== undefined && data.age !== '') {
    const age = Number(data.age);
    if (!Number.isInteger(age) || age < 0 || age > 50) {
      errors.push('age debe ser un número entero entre 0 y 50');
    }
  }

  if (data.status !== undefined && !allowedStatus.includes(status)) {
    errors.push('status inválido');
  }

  if (breed.length > 80) errors.push('breed no puede superar 80 caracteres');
  if (phone.length > 20) errors.push('phone no puede superar 20 caracteres');
  if (description.length > 300) errors.push('description no puede superar 300 caracteres');

  return errors;
}

function nextPetId() {
  const row = db
    .prepare("SELECT id FROM pets WHERE id LIKE 'PET-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1")
    .get();

  const lastNumber = row ? Number(String(row.id).replace('PET-', '')) : 0;
  return `PET-${String(lastNumber + 1).padStart(4, '0')}`;
}

function mapPet(row) {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    breed: row.breed || '',
    age: row.age ?? '',
    owner: row.owner,
    phone: row.phone || '',
    status: row.status,
    description: row.description || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function findAllPets() {
  return db.prepare('SELECT * FROM pets ORDER BY createdAt DESC').all().map(mapPet);
}

function findPetById(id) {
  const row = db.prepare('SELECT * FROM pets WHERE id = ?').get(clean(id));
  return row ? mapPet(row) : null;
}

function insertPet(body) {
  const now = new Date().toISOString();

  const pet = {
    id: nextPetId(),
    name: clean(body.name),
    species: normalizeSpecies(body.species),
    breed: clean(body.breed),
    age: body.age === '' || body.age === undefined ? null : Number(body.age),
    owner: clean(body.owner),
    phone: clean(body.phone),
    status: normalizeStatus(body.status),
    description: clean(body.description),
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO pets (
      id, name, species, breed, age, owner, phone, status, description, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pet.id,
    pet.name,
    pet.species,
    pet.breed,
    pet.age,
    pet.owner,
    pet.phone,
    pet.status,
    pet.description,
    pet.createdAt,
    pet.updatedAt,
  );

  return pet;
}

function updatePet(id, body) {
  const current = findPetById(id);
  if (!current) return null;

  const updated = {
    ...current,
    name: body.name !== undefined ? clean(body.name) : current.name,
    species: body.species !== undefined ? normalizeSpecies(body.species) : current.species,
    breed: body.breed !== undefined ? clean(body.breed) : current.breed,
    age: body.age !== undefined ? (body.age === '' ? null : Number(body.age)) : current.age,
    owner: body.owner !== undefined ? clean(body.owner) : current.owner,
    phone: body.phone !== undefined ? clean(body.phone) : current.phone,
    status: body.status !== undefined ? normalizeStatus(body.status) : current.status,
    description: body.description !== undefined ? clean(body.description) : current.description,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE pets
    SET name = ?,
        species = ?,
        breed = ?,
        age = ?,
        owner = ?,
        phone = ?,
        status = ?,
        description = ?,
        updatedAt = ?
    WHERE id = ?
  `).run(
    updated.name,
    updated.species,
    updated.breed,
    updated.age,
    updated.owner,
    updated.phone,
    updated.status,
    updated.description,
    updated.updatedAt,
    updated.id,
  );

  return updated;
}

function deletePetById(id) {
  const pet = findPetById(id);
  if (!pet) return null;

  db.prepare('DELETE FROM pets WHERE id = ?').run(clean(id));
  return pet;
}

function getPetStats() {
  const total = db.prepare('SELECT COUNT(*) AS total FROM pets').get().total;
  const active = db.prepare("SELECT COUNT(*) AS total FROM pets WHERE status = 'activo'").get().total;
  const treatment = db.prepare("SELECT COUNT(*) AS total FROM pets WHERE status = 'en_tratamiento'").get().total;
  const lost = db.prepare("SELECT COUNT(*) AS total FROM pets WHERE status = 'perdido'").get().total;

  return { total, active, treatment, lost };
}

async function sendEvent(action, pet) {
  try {
    await axios.post(
      EVENT_MANAGER_URL,
      {
        source: 'PetManagementSystem',
        entity: 'Pet',
        action: action.toUpperCase(),
        title: `[${action.toUpperCase()}] ${pet.name || pet.id || 'Mascota'}`,
        description: `Especie: ${pet.species || 'sistema'} | Dueño: ${pet.owner || 'sistema'} | Estado: ${pet.status || 'consulta'}`,
        payload: pet,
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
    api: 'pets-crud',
    database: fs.existsSync(DB_PATH) ? 'connected' : 'not-found',
    databasePath: DB_PATH,
    hub,
    timestamp: new Date().toISOString(),
  });
});

app.get('/pets/stats', (req, res) => {
  res.json(getPetStats());
});

app.get('/pets', async (req, res) => {
  const pets = findAllPets();

  await sendEvent('QUERY', {
    id: 'ALL',
    name: 'Consulta general de mascotas',
    species: 'system',
    owner: 'system',
    status: 'query',
    total: pets.length,
  });

  return res.json(pets);
});

app.get('/pets/:id', async (req, res) => {
  const pet = findPetById(req.params.id);

  if (!pet) {
    return res.status(404).json({ error: 'Mascota no encontrada' });
  }

  await sendEvent('QUERY', pet);
  return res.json(pet);
});

app.post('/pets', async (req, res) => {
  const errors = validatePet(req.body);

  if (errors.length) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  const pet = insertPet(req.body);
  await sendEvent('CREATE', pet);

  return res.status(201).json(pet);
});

app.put('/pets/:id', async (req, res) => {
  const exists = findPetById(req.params.id);

  if (!exists) {
    return res.status(404).json({ error: 'Mascota no encontrada' });
  }

  const errors = validatePet(req.body, true);

  if (errors.length) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  const updated = updatePet(req.params.id, req.body);
  await sendEvent('UPDATE', updated);

  return res.json(updated);
});

app.delete('/pets/:id', async (req, res) => {
  const deleted = deletePetById(req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Mascota no encontrada' });
  }

  await sendEvent('DELETE', deleted);

  return res.json({
    message: 'Mascota eliminada',
    pet: deleted,
  });
});

function startServer() {
  return app.listen(PORT, () => {
    console.log(`🐾 Sistema de Gestión de Mascotas corriendo en http://localhost:${PORT}`);
    console.log(`🗄️ Base de datos: ${DB_PATH}`);
    console.log('📡 Enviando eventos al Event Manager en http://localhost:3000');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  clean,
  normalizeSpecies,
  normalizeStatus,
  validatePet,
  getPetStats,
  findAllPets,
  findPetById,
  insertPet,
  updatePet,
  deletePetById,
  startServer,
};