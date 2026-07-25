const test    = require('node:test');
const assert  = require('node:assert/strict');
const path    = require('node:path');
const fs      = require('node:fs');
const os      = require('node:os');

// BD temporal aislada por corrida
const TMP_DB = path.join(os.tmpdir(), `audiohub-au01-${Date.now()}.sqlite`);
process.env.AUDIO_DB_PATH = TMP_DB;

const { queryAudios, insertAudio } = require('../server');

// ── Seed ──────────────────────────────────────────────────────────────────────

test.before(() => {
  const seed = [
    { tipo: 'cancion', titulo: 'Bohemian Rhapsody',    autor: 'Queen' },
    { tipo: 'cancion', titulo: 'Yesterday',            autor: 'The Beatles' },
    { tipo: 'cancion', titulo: 'Imagine',              autor: 'John Lennon' },
    { tipo: 'podcast', titulo: 'Tecnologia hoy',       autor: 'EPN Radio' },
    { tipo: 'podcast', titulo: 'Tecnologia y futuro',  autor: 'EPN FISEI' },
    { tipo: 'podcast', titulo: 'Tecnologia aplicada',  autor: 'EPN Investigación' },
    { tipo: 'podcast', titulo: 'Tecnologia y ciencia', autor: 'EPN Ciencia' },
    { tipo: 'podcast', titulo: 'Tecnologia diaria',    autor: 'EPN Diario' },
    { tipo: 'podcast', titulo: 'Tecnologia semanal',   autor: 'Otro Autor' },
    { tipo: 'podcast', titulo: 'Historia del Rock',    autor: 'BBC' },
  ];
  seed.forEach(insertAudio);
});

test.after(() => {
  try { fs.unlinkSync(TMP_DB); } catch { /* ignore */ }
});

// ── TC-AU-01-001: filtrar por tipo ────────────────────────────────────────────

test('TC-AU-01-001: GET /audios?tipo=podcast devuelve solo podcasts', () => {
  const res = queryAudios({ tipo: 'podcast', limit: 100 });
  assert.equal(res.errors, undefined);
  assert.ok(res.data.length > 0);
  res.data.forEach(a => assert.equal(a.tipo, 'podcast'));
});

test('rechaza tipo inválido', () => {
  const res = queryAudios({ tipo: 'album' });
  assert.ok(res.errors && res.errors.some(e => e.includes('tipo')));
});

// ── TC-AU-01-002: coincidencias parciales por autor ───────────────────────────

test('TC-AU-01-002: GET /audios?autor=EPN devuelve coincidencias parciales', () => {
  const res = queryAudios({ autor: 'EPN', limit: 100 });
  assert.equal(res.errors, undefined);
  assert.ok(res.data.length >= 5);
  res.data.forEach(a => assert.ok(a.autor.toLowerCase().includes('epn')));
});

test('la búsqueda por autor no distingue mayúsculas', () => {
  const res = queryAudios({ autor: 'epn', limit: 100 });
  assert.ok(res.data.every(a => a.autor.toLowerCase().includes('epn')));
});

// ── TC-AU-01-003: q + page + limit ────────────────────────────────────────────

test('TC-AU-01-003: GET /audios?q=tecnologia&page=1&limit=5 devuelve máx 5 y metadata', () => {
  const res = queryAudios({ q: 'tecnologia', page: 1, limit: 5 });
  assert.equal(res.errors, undefined);
  assert.ok(res.data.length <= 5);
  res.data.forEach(a => assert.ok(a.titulo.toLowerCase().includes('tecnologia')));
  assert.ok(res.pagination.total >= res.data.length);
  assert.equal(res.pagination.page, 1);
  assert.equal(res.pagination.limit, 5);
  assert.equal(res.pagination.pages, Math.ceil(res.pagination.total / 5));
});

test('la segunda página devuelve elementos distintos a la primera', () => {
  const p1 = queryAudios({ q: 'tecnologia', page: 1, limit: 3 });
  const p2 = queryAudios({ q: 'tecnologia', page: 2, limit: 3 });
  const idsP1 = new Set(p1.data.map(a => a.id));
  p2.data.forEach(a => assert.ok(!idsP1.has(a.id), `ID ${a.id} repetido entre páginas`));
});

// ── TC-AU-01-004: sortBy + order ──────────────────────────────────────────────

test('TC-AU-01-004: GET /audios?sortBy=titulo&order=asc devuelve orden alfabético', () => {
  const res = queryAudios({ sortBy: 'titulo', order: 'asc', limit: 100 });
  assert.equal(res.errors, undefined);
  const titulos = res.data.map(a => a.titulo);
  const ordenados = [...titulos].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(titulos, ordenados);
});

test('sortBy=autor&order=desc devuelve orden inverso por autor', () => {
  const res = queryAudios({ sortBy: 'autor', order: 'desc', limit: 100 });
  const autores  = res.data.map(a => a.autor);
  const esperado = [...autores].sort((a, b) => b.localeCompare(a));
  assert.deepEqual(autores, esperado);
});

test('rechaza sortBy no permitido', () => {
  const res = queryAudios({ sortBy: 'DROP TABLE' });
  assert.ok(res.errors && res.errors.some(e => e.includes('sortBy')));
});

test('rechaza order no permitido', () => {
  const res = queryAudios({ order: 'random' });
  assert.ok(res.errors && res.errors.some(e => e.includes('order')));
});

// ── Validación de page / limit ────────────────────────────────────────────────

test('page = 0 es inválido', () => {
  const res = queryAudios({ page: 0 });
  assert.ok(res.errors && res.errors.some(e => e.includes('page')));
});

test('limit > 100 es inválido', () => {
  const res = queryAudios({ limit: 500 });
  assert.ok(res.errors && res.errors.some(e => e.includes('limit')));
});

test('limit = 100 es válido (máximo)', () => {
  const res = queryAudios({ limit: 100 });
  assert.equal(res.errors, undefined);
  assert.equal(res.pagination.limit, 100);
});

test('page o limit no numéricos son inválidos', () => {
  const res = queryAudios({ page: 'abc', limit: 'xyz' });
  assert.ok(res.errors && res.errors.length >= 2);
});

// ── Filtros combinados ────────────────────────────────────────────────────────

test('filtros combinados (tipo + autor + q)', () => {
  const res = queryAudios({
    tipo:  'podcast',
    autor: 'EPN',
    q:     'tecnologia',
    limit: 100,
  });
  assert.equal(res.errors, undefined);
  res.data.forEach(a => {
    assert.equal(a.tipo, 'podcast');
    assert.ok(a.autor.toLowerCase().includes('epn'));
    assert.ok(a.titulo.toLowerCase().includes('tecnologia'));
  });
});

// ── Estructura de respuesta ───────────────────────────────────────────────────

test('la respuesta tiene la forma { data, pagination }', () => {
  const res = queryAudios({});
  assert.ok(Array.isArray(res.data));
  assert.equal(typeof res.pagination, 'object');
  assert.equal(typeof res.pagination.total, 'number');
  assert.equal(typeof res.pagination.page,  'number');
  assert.equal(typeof res.pagination.limit, 'number');
  assert.equal(typeof res.pagination.pages, 'number');
});