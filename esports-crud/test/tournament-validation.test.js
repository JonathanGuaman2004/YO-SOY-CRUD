'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// Importar funciones a testear
const {
  clean,
  normalizeStatus,
  validateTournament,
  ALLOWED_GAMES,
  ALLOWED_STATUS,
} = require('../server.js');

describe('clean()', () => {
  it('retorna string vacío para null', () => assert.equal(clean(null), ''));
  it('retorna string vacío para undefined', () => assert.equal(clean(undefined), ''));
  it('retorna string vacío para objeto (bug correctivo)', () => assert.equal(clean({}), ''));
  it('hace trim correctamente', () => assert.equal(clean('  hola  '), 'hola'));
  it('convierte número a string', () => assert.equal(clean(42), '42'));
});

describe('normalizeStatus()', () => {
  it('acepta status válidos', () => {
    ALLOWED_STATUS.forEach(s => assert.equal(normalizeStatus(s), s));
  });
  it('retorna próximo para valor inválido', () => {
    assert.equal(normalizeStatus('activo'), 'próximo');
    assert.equal(normalizeStatus(''), 'próximo');
  });
});

describe('validateTournament() — creación', () => {
  const validBase = {
    name: 'EPN Open 2026', game: 'Valorant', organizer: 'EPN Esports',
    date_start: '2026-06-01', date_end: '2026-06-10',
    prize_pool: 1000, max_teams: 8,
  };

  it('acepta datos válidos sin errores', () => {
    assert.deepEqual(validateTournament(validBase), []);
  });

  it('rechaza name vacío', () => {
    const errors = validateTournament({ ...validBase, name: '' });
    assert.ok(errors.some(e => e.includes('name')));
  });

  it('rechaza juego no permitido', () => {
    const errors = validateTournament({ ...validBase, game: 'Tetris' });
    assert.ok(errors.some(e => e.includes('game')));
  });

  it('rechaza fecha_end anterior a fecha_start (Mantenimiento Adaptativo)', () => {
    const errors = validateTournament({ ...validBase, date_start: '2026-06-10', date_end: '2026-06-01' });
    assert.ok(errors.some(e => e.includes('date_end')));
  });

  it('rechaza prize_pool negativo', () => {
    const errors = validateTournament({ ...validBase, prize_pool: -500 });
    assert.ok(errors.some(e => e.includes('prize_pool')));
  });

  it('rechaza max_teams fuera de rango (1 o >256)', () => {
    const errors1 = validateTournament({ ...validBase, max_teams: 1 });
    const errors2 = validateTournament({ ...validBase, max_teams: 300 });
    assert.ok(errors1.some(e => e.includes('max_teams')));
    assert.ok(errors2.some(e => e.includes('max_teams')));
  });

  it('rechaza description larga (Preventivo)', () => {
    const errors = validateTournament({ ...validBase, description: 'x'.repeat(401) });
    assert.ok(errors.some(e => e.includes('description')));
  });
});

describe('ALLOWED_GAMES', () => {
  it('contiene los juegos principales', () => {
    assert.ok(ALLOWED_GAMES.includes('Valorant'));
    assert.ok(ALLOWED_GAMES.includes('CS2'));
    assert.ok(ALLOWED_GAMES.includes('League of Legends'));
  });
});