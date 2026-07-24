const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

process.env.PETS_DB_PATH = path.join(
  os.tmpdir(),
  `pets-query-${process.pid}-${Date.now()}.sqlite`,
);

const {
  validatePetFilters,
  insertPet,
  findAllPets,
} = require('../server');

function createTestPets() {
  insertPet({
    name: 'Luna',
    species: 'perro',
    breed: 'Labrador',
    age: 4,
    owner: 'Ana Pérez',
    status: 'activo',
    description: 'Mascota de prueba',
  });

  insertPet({
    name: 'Michi',
    species: 'gato',
    breed: 'Siamés',
    age: 2,
    owner: 'Carlos Ruiz',
    status: 'adoptado',
    description: 'Mascota adoptada',
  });

  insertPet({
    name: 'Rocky',
    species: 'perro',
    breed: 'Pastor Alemán',
    age: 9,
    owner: 'Gabriela Torres',
    status: 'en_tratamiento',
    description: 'Mascota en tratamiento',
  });
}

createTestPets();

test('filtros: acepta parámetros válidos', () => {
  const errors = validatePetFilters({
    species: 'perro',
    status: 'activo',
    minAge: '1',
    maxAge: '8',
    page: '1',
    limit: '10',
  });

  assert.deepEqual(errors, []);
});

test('filtros: rechaza page y limit inválidos', () => {
  const errors = validatePetFilters({
    page: '0',
    limit: '101',
  });

  assert.ok(
    errors.includes(
      'page debe ser un entero mayor o igual a 1',
    ),
  );

  assert.ok(
    errors.includes(
      'limit debe ser un entero entre 1 y 100',
    ),
  );
});

test('filtros: rechaza un rango de edad inconsistente', () => {
  const errors = validatePetFilters({
    minAge: '10',
    maxAge: '2',
  });

  assert.ok(
    errors.includes(
      'minAge no puede ser mayor que maxAge',
    ),
  );
});

test('consulta: filtra mascotas por especie', () => {
  const result = findAllPets({
    species: 'perro',
    page: '1',
    limit: '10',
  });

  assert.equal(result.data.length, 2);

  assert.ok(
    result.data.every(
      (pet) => pet.species === 'perro',
    ),
  );

  assert.equal(result.pagination.total, 2);
});

test('consulta: filtra mascotas por estado', () => {
  const result = findAllPets({
    status: 'adoptado',
    page: '1',
    limit: '10',
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].name, 'Michi');
});

test('consulta: filtra mascotas por propietario', () => {
  const result = findAllPets({
    owner: 'ana',
    page: '1',
    limit: '10',
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].owner, 'Ana Pérez');
});

test('consulta: filtra mascotas por rango de edad', () => {
  const result = findAllPets({
    minAge: '2',
    maxAge: '8',
    page: '1',
    limit: '10',
  });

  assert.equal(result.data.length, 2);

  assert.ok(
    result.data.every(
      (pet) => pet.age >= 2 && pet.age <= 8,
    ),
  );
});

test('consulta: busca por nombre', () => {
  const result = findAllPets({
    q: 'luna',
    page: '1',
    limit: '10',
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].name, 'Luna');
});

test('consulta: busca por raza', () => {
  const result = findAllPets({
    q: 'siamés',
    page: '1',
    limit: '10',
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].name, 'Michi');
});

test('consulta: combina varios filtros', () => {
  const result = findAllPets({
    species: 'perro',
    minAge: '3',
    maxAge: '5',
    q: 'luna',
    page: '1',
    limit: '10',
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].name, 'Luna');
});

test('paginación: devuelve metadata correcta', () => {
  const result = findAllPets({
    page: '1',
    limit: '2',
  });

  assert.equal(result.data.length, 2);
  assert.equal(result.pagination.page, 1);
  assert.equal(result.pagination.limit, 2);
  assert.equal(result.pagination.total, 3);
  assert.equal(result.pagination.totalPages, 2);
  assert.equal(result.pagination.returned, 2);
  assert.equal(result.pagination.hasNextPage, true);
});

test('paginación: devuelve la segunda página', () => {
  const result = findAllPets({
    page: '2',
    limit: '2',
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.hasNextPage, false);
});