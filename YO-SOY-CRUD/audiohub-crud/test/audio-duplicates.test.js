const test    = require('node:test');
const assert  = require('node:assert/strict');
const path    = require('node:path');
const fs      = require('node:fs');
const os      = require('node:os');

// BD temporal aislada
const TMP_DB = path.join(os.tmpdir(), `audiohub-au02-${Date.now()}.sqlite`);
process.env.AUDIO_DB_PATH = TMP_DB;

const {
  normalize,
  insertAudio,
  updateAudio,
  findDuplicateAudio,
  findAllAudios,
} = require('../server');

test.after(() => {
  try { fs.unlinkSync(TMP_DB); } catch { /* ignore */ }
});

// ── normalize ─────────────────────────────────────────────────────────────────

test('normalize: minúsculas, trim y colapsa espacios internos', () => {
  assert.equal(normalize('  Mi   Cancion  '), 'mi cancion');
  assert.equal(normalize('QUEEN'), 'queen');
  assert.equal(normalize('The\tBeatles'), 'the beatles');
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
});

// ── TC-AU-02-001: dos audios exactamente iguales ──────────────────────────────

test('TC-AU-02-001: crear dos audios idénticos → el segundo es detectado como duplicado', () => {
  const a = insertAudio({ tipo: 'cancion', titulo: 'Bohemian Rhapsody', autor: 'Queen' });
  const dup = findDuplicateAudio({ tipo: 'cancion', titulo: 'Bohemian Rhapsody', autor: 'Queen' });
  assert.ok(dup);
  assert.equal(dup.id, a.id);
});

// ── TC-AU-02-002: mayúsculas / minúsculas ─────────────────────────────────────

test('TC-AU-02-002: "Mi Canción" y "mi canción" con mismo tipo y autor son duplicados', () => {
  insertAudio({ tipo: 'cancion', titulo: 'Mi Canción', autor: 'Autor X' });
  const dup = findDuplicateAudio({ tipo: 'cancion', titulo: 'mi canción', autor: 'autor x' });
  assert.ok(dup);
  assert.equal(dup.titulo, 'Mi Canción');
});

// ── TC-AU-02-003: espacios sobrantes ──────────────────────────────────────────

test('TC-AU-02-003: título y autor con espacios adicionales son reconocidos como duplicado', () => {
  insertAudio({ tipo: 'podcast', titulo: 'Radio Tech', autor: 'EPN Radio' });
  const dup = findDuplicateAudio({
    tipo:   'podcast',
    titulo: '  Radio   Tech  ',
    autor:  '  EPN    Radio  ',
  });
  assert.ok(dup);
  assert.equal(dup.titulo, 'Radio Tech');
});

// ── TC-AU-02-004: update sin cambiar combinación única ────────────────────────

test('TC-AU-02-004: actualizar un audio sin cambiar su combinación única es válido', () => {
  const audio = insertAudio({ tipo: 'cancion', titulo: 'Yesterday', autor: 'The Beatles' });

  // Simula el chequeo real: excluir el propio id
  const dup = findDuplicateAudio({
    tipo:      'cancion',
    titulo:    'Yesterday',
    autor:     'The Beatles',
    excludeId: audio.id,
  });
  assert.equal(dup, null);

  // Y la actualización se ejecuta sin problema
  const updated = updateAudio(audio.id, { titulo: 'Yesterday' });
  assert.equal(updated.titulo, 'Yesterday');
});

// ── Reglas adicionales ────────────────────────────────────────────────────────

test('mismo título y autor pero distinto tipo NO es duplicado', () => {
  insertAudio({ tipo: 'cancion', titulo: 'Cruzado', autor: 'Autor Cruzado' });
  const dup = findDuplicateAudio({ tipo: 'podcast', titulo: 'Cruzado', autor: 'Autor Cruzado' });
  assert.equal(dup, null);
});

test('mismo tipo y título pero distinto autor NO es duplicado', () => {
  insertAudio({ tipo: 'cancion', titulo: 'Mismo Título', autor: 'Autor A' });
  const dup = findDuplicateAudio({ tipo: 'cancion', titulo: 'Mismo Título', autor: 'Autor B' });
  assert.equal(dup, null);
});

test('al actualizar hacia los valores de OTRO registro sí detecta duplicado', () => {
  const a = insertAudio({ tipo: 'cancion', titulo: 'Alpha', autor: 'Autor Alpha' });
  insertAudio({ tipo: 'cancion', titulo: 'Beta', autor: 'Autor Beta' });

  const dup = findDuplicateAudio({
    tipo:      'cancion',
    titulo:    'Beta',
    autor:     'Autor Beta',
    excludeId: a.id, // intentamos mover A hacia los valores de B
  });
  assert.ok(dup);
});

// ── Integridad: los duplicados no se guardan ──────────────────────────────────
// (Verifica indirectamente que el handler POST no llamó a insertAudio,
//  contando cuántos registros existen con esa combinación única)

test('no debe haber más de un registro con la misma combinación normalizada', () => {
  const all = findAllAudios();
  const seen = new Map();

  for (const a of all) {
    const key = `${normalize(a.tipo)}|${normalize(a.titulo)}|${normalize(a.autor)}`;
    assert.ok(!seen.has(key), `Duplicado en BD: ${key} (ids ${seen.get(key)} y ${a.id})`);
    seen.set(key, a.id);
  }
});