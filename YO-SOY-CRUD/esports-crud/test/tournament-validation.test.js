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

const {
  buildTournamentWhere,
  validateTournamentQuery,
  ALLOWED_SORT_BY,
  validateUpdateBody,
  validateFinalDateRange,
  VALID_UPDATE_FIELDS,
} = require('../server.js');

// ═══════════════════════════════════════════════════
// SUITE 6 — buildTournamentWhere()
// ═══════════════════════════════════════════════════
describe('buildTournamentWhere() — filtros', () => {
  it('retorna WHERE y params vacíos sin filtros', () => {
    const { where, params } = buildTournamentWhere({});
    assert.deepEqual(where, []);
    assert.deepEqual(params, []);
  });

  it('filtra por game exacto', () => {
    const { where, params } = buildTournamentWhere({ game: 'Valorant' });
    assert.equal(where.length, 1);
    assert.ok(where[0].includes('game ='));
    assert.equal(params[0], 'Valorant');
  });

  it('filtra por status exacto', () => {
    const { where, params } = buildTournamentWhere({ status: 'próximo' });
    assert.equal(where.length, 1);
    assert.ok(where[0].includes('status ='));
    assert.equal(params[0], 'próximo');
  });

  it('filtra por organizer con LIKE', () => {
    const { where, params } = buildTournamentWhere({ organizer: 'EPN' });
    assert.equal(where.length, 1);
    assert.ok(where[0].includes('LIKE'));
    assert.equal(params[0], '%EPN%');
  });

  it('filtra por dateFrom', () => {
    const { where, params } = buildTournamentWhere({ dateFrom: '2026-06-01' });
    assert.equal(where.length, 1);
    assert.ok(where[0].includes('date_start'));
    assert.equal(params[0], '2026-06-01');
  });

  it('filtra por dateTo', () => {
    const { where, params } = buildTournamentWhere({ dateTo: '2026-12-31' });
    assert.equal(where.length, 1);
    assert.ok(where[0].includes('date_end'));
    assert.equal(params[0], '2026-12-31');
  });

  it('filtra por minPrize', () => {
    const { where, params } = buildTournamentWhere({ minPrize: '500' });
    assert.equal(where.length, 1);
    assert.ok(where[0].includes('prize_pool'));
    assert.equal(params[0], 500);
  });

  it('filtra por maxPrize', () => {
    const { where, params } = buildTournamentWhere({ maxPrize: '2000' });
    assert.equal(where.length, 1);
    assert.ok(where[0].includes('prize_pool'));
    assert.equal(params[0], 2000);
  });

  it('combina múltiples filtros', () => {
    const { where, params } = buildTournamentWhere({
      game: 'Valorant', status: 'próximo', minPrize: '500',
    });
    assert.equal(where.length, 3);
    assert.equal(params.length, 3);
  });
});

// ═══════════════════════════════════════════════════
// SUITE 7 — validateTournamentQuery()
// ═══════════════════════════════════════════════════
describe('validateTournamentQuery() — validación de parámetros', () => {
  it('acepta query vacía sin errores', () => {
    assert.deepEqual(validateTournamentQuery({}), []);
  });

  it('rechaza page < 1', () => {
    const e = validateTournamentQuery({ page: '0' });
    assert.ok(e.some(x => x.includes('page')));
  });

  it('rechaza page no entero', () => {
    const e = validateTournamentQuery({ page: '1.5' });
    assert.ok(e.some(x => x.includes('page')));
  });

  it('TC-ES-01-004: rechaza page=0 y limit=500', () => {
    const e = validateTournamentQuery({ page: '0', limit: '500' });
    assert.ok(e.some(x => x.includes('page')));
    assert.ok(e.some(x => x.includes('limit')));
  });

  it('rechaza limit < 1', () => {
    const e = validateTournamentQuery({ limit: '0' });
    assert.ok(e.some(x => x.includes('limit')));
  });

  it('rechaza limit > 100', () => {
    const e = validateTournamentQuery({ limit: '500' });
    assert.ok(e.some(x => x.includes('limit')));
  });

  it('rechaza minPrize negativo', () => {
    const e = validateTournamentQuery({ minPrize: '-100' });
    assert.ok(e.some(x => x.includes('minPrize')));
  });

  it('rechaza maxPrize negativo', () => {
    const e = validateTournamentQuery({ maxPrize: '-1' });
    assert.ok(e.some(x => x.includes('maxPrize')));
  });

  it('rechaza dateFrom inválido', () => {
    const e = validateTournamentQuery({ dateFrom: 'no-es-fecha' });
    assert.ok(e.some(x => x.includes('dateFrom')));
  });

  it('rechaza dateTo inválido', () => {
    const e = validateTournamentQuery({ dateTo: 'fecha-invalida' });
    assert.ok(e.some(x => x.includes('dateTo')));
  });

  it('rechaza minPrize > maxPrize', () => {
    const e = validateTournamentQuery({ minPrize: '2000', maxPrize: '500' });
    assert.ok(e.some(x => x.includes('minPrize')));
  });

  it('rechaza sortBy inválido', () => {
    const e = validateTournamentQuery({ sortBy: 'invalidField' });
    assert.ok(e.some(x => x.includes('sortBy')));
  });

  it('acepta sortBy válido', () => {
    ALLOWED_SORT_BY.forEach(field => {
      assert.deepEqual(validateTournamentQuery({ sortBy: field }), []);
    });
  });

  it('rechaza order inválido', () => {
    const e = validateTournamentQuery({ order: 'invalid' });
    assert.ok(e.some(x => x.includes('order')));
  });

  it('acepta order asc', () => {
    assert.deepEqual(validateTournamentQuery({ order: 'asc' }), []);
  });

  it('acepta order desc', () => {
    assert.deepEqual(validateTournamentQuery({ order: 'desc' }), []);
  });

  it('acepta page=1 y limit=10 válidos', () => {
    assert.deepEqual(validateTournamentQuery({ page: '1', limit: '10' }), []);
  });

  it('acepta limit=100 (máximo permitido)', () => {
    assert.deepEqual(validateTournamentQuery({ limit: '100' }), []);
  });
});

// ═══════════════════════════════════════════════════
// SUITE 8 — validateUpdateBody()
// ═══════════════════════════════════════════════════
describe('validateUpdateBody() — cuerpo de actualización', () => {
  it('rechaza body vacío {} (TC-ES-02-004)', () => {
    const e = validateUpdateBody({});
    assert.ok(e.some(x => x.includes('No se enviaron campos')));
  });

  it('rechaza body null', () => {
    const e = validateUpdateBody(null);
    assert.ok(e.length > 0);
  });

  it('rechaza body con campos no válidos', () => {
    const e = validateUpdateBody({ invalidField: 'test' });
    assert.ok(e.some(x => x.includes('No se enviaron campos')));
  });

  it('acepta body con al menos un campo válido', () => {
    VALID_UPDATE_FIELDS.forEach(field => {
      const body = { [field]: 'test' };
      assert.deepEqual(validateUpdateBody(body), []);
    });
  });

  it('acepta body con múltiples campos válidos', () => {
    const e = validateUpdateBody({ name: 'Nuevo nombre', game: 'Valorant' });
    assert.deepEqual(e, []);
  });
});

// ═══════════════════════════════════════════════════
// SUITE 9 — validateFinalDateRange()
// ═══════════════════════════════════════════════════
describe('validateFinalDateRange() — rango de fechas en actualización parcial', () => {
  const stored = {
    date_start: '2026-06-01',
    date_end: '2026-06-15',
  };

  it('acepta rango válido sin cambios en fechas', () => {
    assert.deepEqual(validateFinalDateRange(stored, {}), []);
  });

  it('acepta rango válido actualizando solo date_start (TC-ES-02-003)', () => {
    const e = validateFinalDateRange(stored, { date_start: '2026-06-05' });
    assert.deepEqual(e, []);
  });

  it('rechaza date_start posterior a date_end almacenado (TC-ES-02-001)', () => {
    const e = validateFinalDateRange(stored, { date_start: '2026-06-20' });
    assert.ok(e.some(x => x.includes('date_end')));
  });

  it('rechaza date_end anterior a date_start almacenado (TC-ES-02-002)', () => {
    const e = validateFinalDateRange(stored, { date_end: '2026-05-01' });
    assert.ok(e.some(x => x.includes('date_end')));
  });

  it('rechaza date_start igual a date_end', () => {
    const e = validateFinalDateRange(stored, { date_start: '2026-06-15', date_end: '2026-06-15' });
    assert.ok(e.some(x => x.includes('date_end')));
  });

  it('acepta rango válido modificando ambas fechas', () => {
    const e = validateFinalDateRange(stored, { date_start: '2026-07-01', date_end: '2026-07-15' });
    assert.deepEqual(e, []);
  });

  it('rechaza date_start con formato inválido', () => {
    const e = validateFinalDateRange(stored, { date_start: 'fecha-invalida' });
    assert.ok(e.some(x => x.includes('date_start')));
  });

  it('rechaza date_end con formato inválido', () => {
    const e = validateFinalDateRange(stored, { date_end: 'no-valida' });
    assert.ok(e.some(x => x.includes('date_end')));
  });
});