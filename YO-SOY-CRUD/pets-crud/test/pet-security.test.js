const test = require('node:test');
const assert = require('node:assert/strict');

process.env.FIS_EPN_API_KEY = 'test-secret-key';

const { requireApiKey } = require('../server');

function createRequest(apiKey) {
  return {
    method: 'POST',
    originalUrl: '/pets',
    ip: '127.0.0.1',

    get(headerName) {
      if (headerName === 'X-FIS-EPN-KEY') {
        return apiKey;
      }

      return undefined;
    },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('seguridad: devuelve 401 cuando falta la API Key', () => {
  const req = createRequest(undefined);
  const res = createResponse();
  let nextCalled = false;

  requireApiKey(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.match(res.body.error, /X-FIS-EPN-KEY/);
});

test('seguridad: devuelve 403 con API Key incorrecta', () => {
  const req = createRequest('clave-incorrecta');
  const res = createResponse();
  let nextCalled = false;

  requireApiKey(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
  assert.equal(res.body.error, 'API Key inválida');
});

test('seguridad: permite continuar con API Key válida', () => {
  const req = createRequest('test-secret-key');
  const res = createResponse();
  let nextCalled = false;

  requireApiKey(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 200);
  assert.equal(nextCalled, true);
});