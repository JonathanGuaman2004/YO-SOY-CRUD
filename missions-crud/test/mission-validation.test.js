const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStatus, validateMission } = require('../server');

test('validación: rechaza misión sin nombre, agencia y tipo', () => {
  const errors = validateMission({});
  assert.ok(errors.includes('name es obligatorio'));
  assert.ok(errors.includes('agency es obligatorio'));
  assert.ok(errors.includes('type es obligatorio'));
});

test('validación: acepta una misión correcta', () => {
  const errors = validateMission({
    name: 'Artemis IV',
    agency: 'NASA',
    type: 'Lunar',
    status: 'planned',
  });
  assert.deepEqual(errors, []);
});

test('estado: normaliza estados desconocidos a planned', () => {
  assert.equal(normalizeStatus('desconocido'), 'planned');
});
