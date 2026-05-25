const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  clean,
  normalizeTipo,
  validateAudio,
  ALLOWED_TYPES,
} = require('../server');

// ── clean ────────────────────────────────────────────────────────────────────

test('clean: recorta espacios', () => {
  assert.equal(clean('  Bohemian Rhapsody  '), 'Bohemian Rhapsody');
});

test('clean: maneja null y undefined', () => {
  assert.equal(clean(null), '');
  assert.equal(clean(undefined), '');
});

test('clean: convierte objetos a cadena vacía', () => {
  assert.equal(clean({ titulo: 'x' }), '');
});

// ── normalizeTipo ─────────────────────────────────────────────────────────────

test('normalizeTipo: acepta cancion en minúsculas', () => {
  assert.equal(normalizeTipo('cancion'), 'cancion');
});

test('normalizeTipo: acepta podcast en minúsculas', () => {
  assert.equal(normalizeTipo('podcast'), 'podcast');
});

test('normalizeTipo: normaliza tipos desconocidos a cancion', () => {
  assert.equal(normalizeTipo('album'), 'cancion');
  assert.equal(normalizeTipo(''), 'cancion');
  assert.equal(normalizeTipo(undefined), 'cancion');
});

test('normalizeTipo: normaliza a minúsculas', () => {
  assert.equal(normalizeTipo('PODCAST'), 'podcast');
  assert.equal(normalizeTipo('Cancion'), 'cancion');
});

// ── validateAudio ─────────────────────────────────────────────────────────────

test('validación: rechaza audio sin campos obligatorios', () => {
  const errors = validateAudio({});
  assert.ok(errors.includes('titulo es obligatorio'));
  assert.ok(errors.includes('autor es obligatorio'));
  assert.ok(errors.includes('tipo es obligatorio'));
});

test('validación: acepta un audio correcto', () => {
  const errors = validateAudio({
    titulo: 'Bohemian Rhapsody',
    autor:  'Queen',
    tipo:   'cancion',
  });
  assert.deepEqual(errors, []);
});

test('validación: acepta tipo podcast', () => {
  const errors = validateAudio({
    titulo: 'Lex Fridman #400',
    autor:  'Lex Fridman',
    tipo:   'podcast',
  });
  assert.deepEqual(errors, []);
});

test('validación: rechaza tipo inválido', () => {
  const errors = validateAudio({
    titulo: 'Mi canción',
    autor:  'Artista',
    tipo:   'album',
  });
  assert.ok(errors.some(e => e.includes('tipo debe ser uno de')));
});

test('validación: rechaza titulo mayor a 120 caracteres', () => {
  const errors = validateAudio({
    titulo: 'A'.repeat(121),
    autor:  'Artista',
    tipo:   'cancion',
  });
  assert.ok(errors.includes('titulo no puede superar 120 caracteres'));
});

test('validación: rechaza autor mayor a 80 caracteres', () => {
  const errors = validateAudio({
    titulo: 'Canción',
    autor:  'B'.repeat(81),
    tipo:   'cancion',
  });
  assert.ok(errors.includes('autor no puede superar 80 caracteres'));
});

test('validación parcial (isUpdate): permite omitir titulo', () => {
  const errors = validateAudio({ autor: 'Nuevo Autor', tipo: 'podcast' }, true);
  assert.deepEqual(errors, []);
});

test('validación parcial (isUpdate): valida titulo si está presente', () => {
  const errors = validateAudio({ titulo: '', autor: 'Artista', tipo: 'cancion' }, true);
  assert.ok(errors.includes('titulo es obligatorio'));
});

// ── ALLOWED_TYPES ──────────────────────────────────────────────────────────────

test('ALLOWED_TYPES contiene cancion y podcast', () => {
  assert.ok(ALLOWED_TYPES.includes('cancion'));
  assert.ok(ALLOWED_TYPES.includes('podcast'));
});
