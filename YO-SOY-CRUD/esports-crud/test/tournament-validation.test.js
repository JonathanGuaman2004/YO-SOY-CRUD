'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  clean,
  normalizeStatus,
  validateTournament,
  ALLOWED_GAMES,
  ALLOWED_STATUS,
} = require('../server.js');

// ═══════════════════════════════════════════════════
// SUITE 1 — clean()  [Mantenimiento Correctivo]
// ═══════════════════════════════════════════════════
describe('clean()', () => {
  it('retorna string vacío para null',      () => assert.equal(clean(null),      ''));
  it('retorna string vacío para undefined', () => assert.equal(clean(undefined), ''));
  it('retorna string vacío para objeto (bug correctivo)', () => assert.equal(clean({}), ''));
  it('retorna string vacío para array',     () => assert.equal(clean([]),        ''));
  it('hace trim correctamente',             () => assert.equal(clean('  hola  '), 'hola'));
  it('convierte número a string',           () => assert.equal(clean(42), '42'));
  it('convierte booleano a string',         () => assert.equal(clean(true), 'true'));
});

// ═══════════════════════════════════════════════════
// SUITE 2 — normalizeStatus()  [Mantenimiento Correctivo]
// ═══════════════════════════════════════════════════
describe('normalizeStatus()', () => {
  it('acepta todos los status válidos', () => {
    ALLOWED_STATUS.forEach(s => assert.equal(normalizeStatus(s), s));
  });
  it('retorna próximo para valor inválido', () => {
    assert.equal(normalizeStatus('activo'),  'próximo');
    assert.equal(normalizeStatus(''),        'próximo');
    assert.equal(normalizeStatus(null),      'próximo');
    assert.equal(normalizeStatus(undefined), 'próximo');
  });
});

// ═══════════════════════════════════════════════════
// SUITE 3 — validateTournament() — creación
// [Mantenimiento Preventivo + Adaptativo]
// ═══════════════════════════════════════════════════
describe('validateTournament() — creación', () => {
  const validBase = {
    name: 'EPN Open 2026', game: 'Valorant', organizer: 'EPN Esports',
    date_start: '2026-06-01', date_end: '2026-06-10',
    prize_pool: 1000, max_teams: 8,
  };

  it('acepta datos completamente válidos sin errores', () => {
    assert.deepEqual(validateTournament(validBase), []);
  });

  // — Nombre —
  it('rechaza name vacío', () => {
    const e = validateTournament({ ...validBase, name: '' });
    assert.ok(e.some(x => x.includes('name')), 'debe reportar error en name');
  });
  it('rechaza name mayor a 80 caracteres', () => {
    const e = validateTournament({ ...validBase, name: 'A'.repeat(81) });
    assert.ok(e.some(x => x.includes('name')));
  });
  it('rechaza name con caracteres peligrosos (preventivo)', () => {
    const e = validateTournament({ ...validBase, name: '<script>alert(1)</script>' });
    assert.ok(e.some(x => x.includes('name')));
  });

  // — Juego —
  it('rechaza juego no permitido', () => {
    const e = validateTournament({ ...validBase, game: 'Tetris' });
    assert.ok(e.some(x => x.includes('game')));
  });
  it('acepta todos los juegos de la lista oficial', () => {
    ALLOWED_GAMES.forEach(game => {
      const e = validateTournament({ ...validBase, game });
      assert.deepEqual(e, [], `${game} debería ser válido`);
    });
  });

  // — Organizador —
  it('rechaza organizer mayor a 60 caracteres', () => {
    const e = validateTournament({ ...validBase, organizer: 'X'.repeat(61) });
    assert.ok(e.some(x => x.includes('organizer')));
  });

  // — Fechas (ADAPTATIVO) —
  it('rechaza date_end anterior a date_start', () => {
    const e = validateTournament({ ...validBase, date_start: '2026-06-10', date_end: '2026-06-01' });
    assert.ok(e.some(x => x.includes('date_end')));
  });
  it('rechaza date_end igual a date_start', () => {
    const e = validateTournament({ ...validBase, date_start: '2026-06-01', date_end: '2026-06-01' });
    assert.ok(e.some(x => x.includes('date_end')));
  });
  it('rechaza fecha con formato inválido', () => {
    const e = validateTournament({ ...validBase, date_start: 'no-es-fecha' });
    assert.ok(e.some(x => x.includes('date_start')));
  });

  // — Prize pool (PREVENTIVO) —
  it('rechaza prize_pool negativo', () => {
    const e = validateTournament({ ...validBase, prize_pool: -500 });
    assert.ok(e.some(x => x.includes('prize_pool')));
  });
  it('rechaza prize_pool mayor a 10,000,000 (preventivo desbordamiento)', () => {
    const e = validateTournament({ ...validBase, prize_pool: 10_000_001 });
    assert.ok(e.some(x => x.includes('prize_pool')));
  });
  it('acepta prize_pool = 0', () => {
    const e = validateTournament({ ...validBase, prize_pool: 0 });
    assert.deepEqual(e, []);
  });

  // — Max teams —
  it('rechaza max_teams = 1 (fuera de rango)', () => {
    const e = validateTournament({ ...validBase, max_teams: 1 });
    assert.ok(e.some(x => x.includes('max_teams')));
  });
  it('rechaza max_teams > 256', () => {
    const e = validateTournament({ ...validBase, max_teams: 300 });
    assert.ok(e.some(x => x.includes('max_teams')));
  });
  it('acepta max_teams = 2 (mínimo válido)', () => {
    const e = validateTournament({ ...validBase, max_teams: 2 });
    assert.deepEqual(e, []);
  });
  it('acepta max_teams = 256 (máximo válido)', () => {
    const e = validateTournament({ ...validBase, max_teams: 256 });
    assert.deepEqual(e, []);
  });

  // — Description —
  it('rechaza description mayor a 400 caracteres (preventivo)', () => {
    const e = validateTournament({ ...validBase, description: 'x'.repeat(401) });
    assert.ok(e.some(x => x.includes('description')));
  });

  // — Status —
  it('rechaza status inválido', () => {
    const e = validateTournament({ ...validBase, status: 'ganando' });
    assert.ok(e.some(x => x.includes('status')));
  });

  // — Body nulo (PREVENTIVO) —
  it('rechaza body nulo', () => {
    const e = validateTournament(null);
    assert.ok(e.length > 0);
  });
});

// ═══════════════════════════════════════════════════
// SUITE 4 — validateTournament() — actualización parcial
// ═══════════════════════════════════════════════════
describe('validateTournament() — actualización parcial (isUpdate=true)', () => {
  it('acepta body vacío sin errores en modo update', () => {
    assert.deepEqual(validateTournament({}, true), []);
  });
  it('valida solo el campo enviado', () => {
    const e = validateTournament({ name: '' }, true);
    assert.ok(e.some(x => x.includes('name')));
  });
  it('acepta actualización de status válido', () => {
    const e = validateTournament({ status: 'finalizado' }, true);
    assert.deepEqual(e, []);
  });
});

// ═══════════════════════════════════════════════════
// SUITE 5 — ALLOWED_GAMES (catálogo)
// ═══════════════════════════════════════════════════
describe('ALLOWED_GAMES — catálogo oficial', () => {
  it('contiene exactamente 10 juegos', () => assert.equal(ALLOWED_GAMES.length, 10));
  it('incluye Valorant',          () => assert.ok(ALLOWED_GAMES.includes('Valorant')));
  it('incluye CS2',               () => assert.ok(ALLOWED_GAMES.includes('CS2')));
  it('incluye League of Legends', () => assert.ok(ALLOWED_GAMES.includes('League of Legends')));
  it('no incluye juegos fuera del catálogo', () => {
    assert.ok(!ALLOWED_GAMES.includes('Minecraft'));
    assert.ok(!ALLOWED_GAMES.includes('Tetris'));
  });
});