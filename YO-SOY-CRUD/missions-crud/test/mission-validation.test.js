const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "missions-crud-test-"));
process.env.MISSIONS_DB_PATH = path.join(tempDir, "missions.sqlite");
process.env.LOG_FILE_PATH = path.join(tempDir, "audit.log");
process.env.SEND_EVENTS = "false";
process.env.FIS_EPN_API_KEY = "test-key";
process.env.REQUIRE_API_KEY = "true";
process.env.EVENT_MANAGER_TIMEOUT_MS = "50";

const { app, validateMission, hasBlockedContent } = require("../server");
const API_KEY = { "X-FIS-EPN-KEY": "test-key" };

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

test("validación: rechaza misión sin campos obligatorios", () => {
  const errors = validateMission({});
  assert.ok(errors.includes("name es obligatorio"));
  assert.ok(errors.includes("agency es obligatorio"));
  assert.ok(errors.includes("type es obligatorio"));
});

test("validación preventiva: bloquea entradas maliciosas básicas", () => {
  assert.equal(hasBlockedContent("<script>alert(1)</script>"), true);
  assert.equal(hasBlockedContent("DROP TABLE missions"), true);

  const errors = validateMission({
    name: "<script>alert(1)</script>",
    agency: "NASA",
    type: "Lunar",
  });
  assert.ok(errors.includes("name contiene contenido no permitido"));
});

test("seguridad: endpoints CRUD exigen X-FIS-EPN-KEY", async () => {
  const server = await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const denied = await fetch(`${baseUrl}/missions`);
    assert.equal(denied.status, 401);

    const allowed = await fetch(`${baseUrl}/missions`, { headers: API_KEY });
    assert.equal(allowed.status, 200);

    const body = await readJson(allowed);
    assert.deepEqual(body.data, []);
    assert.equal(body.pagination.total, 0);
    assert.equal(body.pagination.returned, 0);
  } finally {
    await close(server);
  }
});

test("CRUD: crea, consulta por filtro, actualiza y elimina una misión", async () => {
  const server = await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const createResponse = await fetch(`${baseUrl}/missions`, {
      method: "POST",
      headers: { ...API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Artemis IV",
        agency: "NASA",
        type: "Lunar",
        date: "2028-09-01",
        status: "planned",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await readJson(createResponse);
    assert.match(created.id, /^MSN-\d{4}$/);

    const filteredResponse = await fetch(
      `${baseUrl}/missions?status=planned&q=artemis`,
      { headers: API_KEY },
    );
    assert.equal(filteredResponse.status, 200);

    const filtered = await readJson(filteredResponse);
    assert.equal(filtered.data.length, 1);
    assert.equal(filtered.data[0].name, "Artemis IV");
    assert.equal(filtered.pagination.total, 1);
    const updateResponse = await fetch(`${baseUrl}/missions/${created.id}`, {
      method: "PUT",
      headers: { ...API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await readJson(updateResponse);
    assert.equal(updated.status, "active");

    const deleteResponse = await fetch(`${baseUrl}/missions/${created.id}`, {
      method: "DELETE",
      headers: API_KEY,
    });
    assert.equal(deleteResponse.status, 200);
    const deleted = await readJson(deleteResponse);
    assert.equal(deleted.mission.id, created.id);

    assert.ok(fs.existsSync(path.join(tempDir, "audit.log")));
  } finally {
    await close(server);
  }
});
test('paginación: devuelve metadata en listado de misiones', async () => {
  const server = await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    for (const name of ['Artemis I', 'Artemis II', 'Artemis III']) {
      await fetch(`${baseUrl}/missions`, {
        method: 'POST',
        headers: { ...API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          agency: 'NASA',
          type: 'Lunar',
          date: '2028-09-01',
          status: 'planned',
        }),
      });
    }

    const response = await fetch(`${baseUrl}/missions?limit=2&page=1`, {
      headers: API_KEY,
    });

    assert.equal(response.status, 200);

    const body = await readJson(response);

    assert.equal(body.data.length, 2);
    assert.equal(body.pagination.limit, 2);
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.total >= 3, true);
    assert.equal(body.pagination.totalPages >= 2, true);
    assert.equal(body.pagination.hasNextPage, true);
  } finally {
    await close(server);
  }
});
