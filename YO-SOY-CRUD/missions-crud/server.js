const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

function loadEnvFile(filePath = path.join(__dirname, ".env")) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const app = express();

const DEFAULT_PORT = 4000;
const DB_DIR = path.join(__dirname, "db");
const LOG_DIR = path.join(__dirname, "logs");

const config = Object.freeze({
  port: Number(process.env.PORT || DEFAULT_PORT),
  eventManagerUrl:
    process.env.EVENT_MANAGER_URL || "http://localhost:3000/events",
  eventManagerHealthUrl:
    process.env.EVENT_MANAGER_HEALTH_URL || "http://localhost:3000/health",
  eventManagerTimeoutMs: Number(process.env.EVENT_MANAGER_TIMEOUT_MS || 2500),
  dbPath: process.env.MISSIONS_DB_PATH || path.join(DB_DIR, "missions.sqlite"),
  apiKeyHeader: process.env.API_KEY_HEADER || "X-FIS-EPN-KEY",
  apiKey: process.env.FIS_EPN_API_KEY || "fis-epn-2025",
  requireApiKey: process.env.REQUIRE_API_KEY !== "false",
  sendEvents: process.env.SEND_EVENTS !== "false",
  logFilePath: process.env.LOG_FILE_PATH || path.join(LOG_DIR, "audit.log"),
  corsOrigins: (process.env.CORS_ORIGINS || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
});

const allowedStatus = ["planned", "active", "completed", "failed", "aborted"];
const textLimits = {
  name: 80,
  agency: 60,
  type: 60,
  vehicle: 60,
  crew: 120,
  description: 300,
};

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(path.dirname(config.logFilePath), { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agency TEXT NOT NULL,
    type TEXT NOT NULL,
    vehicle TEXT,
    date TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    crew TEXT,
    description TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
  CREATE INDEX IF NOT EXISTS idx_missions_agency ON missions(agency);
  CREATE INDEX IF NOT EXISTS idx_missions_type ON missions(type);
`);

function writeStructuredLog(level, message, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "missions-crud",
    message,
    ...details,
  };
  const line = JSON.stringify(entry);

  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);

  try {
    fs.appendFileSync(config.logFilePath, `${line}\n`, "utf8");
  } catch (error) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        service: "missions-crud",
        message: "No se pudo escribir el archivo de auditoria",
        error: error.message,
      }),
    );
  }
}

const logger = {
  info: (message, details) => writeStructuredLog("INFO", message, details),
  warn: (message, details) => writeStructuredLog("WARN", message, details),
  error: (message, details) => writeStructuredLog("ERROR", message, details),
};

function audit(req, action, details = {}) {
  logger.info(`AUDIT_${action}`, {
    action,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get("user-agent") || "unknown",
    ...details,
  });
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeStatus(status) {
  const cleanStatus = clean(status || "planned");
  return allowedStatus.includes(cleanStatus) ? cleanStatus : "planned";
}
function isValidIsoDate(value) {
  const text = clean(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function hasBlockedContent(value) {
  const text = clean(value).toLowerCase();
  if (!text) return false;

  const blockedPatterns = [
    /<\s*script/i,
    /<\s*\/\s*script/i,
    /javascript\s*:/i,
    /onerror\s*=/i,
    /onload\s*=/i,
    /drop\s+table/i,
    /delete\s+from/i,
    /insert\s+into/i,
    /select\s+.+\s+from/i,
    /union\s+select/i,
  ];

  return blockedPatterns.some((pattern) => pattern.test(text));
}

function validateTextField(
  errors,
  data,
  fieldName,
  isUpdate,
  required = false,
) {
  const exists = data[fieldName] !== undefined;
  if (isUpdate && !exists) return;

  const value = clean(data[fieldName]);
  const limit = textLimits[fieldName];

  if (required && !value) errors.push(`${fieldName} es obligatorio`);
  if (value.length > limit)
    errors.push(`${fieldName} no puede superar ${limit} caracteres`);
  if (hasBlockedContent(value))
    errors.push(`${fieldName} contiene contenido no permitido`);
}

function validateMission(data = {}, isUpdate = false) {
  const errors = [];
  const body = data || {};
  const status = clean(body.status || "planned");
  const launchDate = clean(body.date);

  validateTextField(errors, body, "name", isUpdate, true);
  validateTextField(errors, body, "agency", isUpdate, true);
  validateTextField(errors, body, "type", isUpdate, true);
  validateTextField(errors, body, "vehicle", isUpdate);
  validateTextField(errors, body, "crew", isUpdate);
  validateTextField(errors, body, "description", isUpdate);

  if (body.status !== undefined && !allowedStatus.includes(status)) {
    errors.push("status inválido");
  }

  if ((!isUpdate || body.date !== undefined) && launchDate) {
    if (!isValidIsoDate(launchDate)) {
      errors.push("date debe tener formato YYYY-MM-DD válido");
    }
  }

  return errors;
}

function validateMissionId(id) {
  return /^MSN-\d{4,}$/.test(clean(id));
}

function nextMissionId() {
  const row = db
    .prepare(
      "SELECT id FROM missions WHERE id LIKE 'MSN-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1",
    )
    .get();
  const lastNumber = row ? Number(String(row.id).replace("MSN-", "")) : 0;
  return `MSN-${String(lastNumber + 1).padStart(4, "0")}`;
}

function mapMission(row) {
  return {
    id: row.id,
    name: row.name,
    agency: row.agency,
    type: row.type,
    vehicle: row.vehicle || "",
    date: row.date || "",
    status: row.status,
    crew: row.crew || "",
    description: row.description || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
function buildMissionWhere(filters = {}) {
  const where = [];
  const params = [];

  if (filters.status) {
    const status = clean(filters.status);
    if (allowedStatus.includes(status)) {
      where.push("status = ?");
      params.push(status);
    }
  }

  if (filters.agency) {
    where.push("LOWER(agency) LIKE ?");
    params.push(`%${clean(filters.agency).toLowerCase()}%`);
  }

  if (filters.type) {
    where.push("LOWER(type) LIKE ?");
    params.push(`%${clean(filters.type).toLowerCase()}%`);
  }

  if (filters.q) {
    const q = `%${clean(filters.q).toLowerCase()}%`;
    where.push(
      "(LOWER(name) LIKE ? OR LOWER(agency) LIKE ? OR LOWER(type) LIKE ? OR LOWER(vehicle) LIKE ? OR LOWER(crew) LIKE ?)",
    );
    params.push(q, q, q, q, q);
  }

  return { where, params };
}
function findAllMissions(filters = {}) {
  const { where, params } = buildMissionWhere(filters);

  const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 100);
  const page = Math.max(Number(filters.page) || 1, 1);
  const offset =
    filters.offset !== undefined
      ? Math.max(Number(filters.offset) || 0, 0)
      : (page - 1) * limit;

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM missions ${whereSql}`)
    .get(...params).total;

  const sql = `
    SELECT * FROM missions
    ${whereSql}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `;

  const data = db
    .prepare(sql)
    .all(...params, limit, offset)
    .map(mapMission);

  return {
    data,
    pagination: {
      total,
      limit,
      offset,
      page,
      totalPages: Math.ceil(total / limit),
      returned: data.length,
      hasNextPage: offset + limit < total,
    },
  };
}

function findMissionById(id) {
  const missionId = clean(id);
  if (!validateMissionId(missionId)) return null;

  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId);
  return row ? mapMission(row) : null;
}

function insertMission(body) {
  const now = new Date().toISOString();
  const mission = {
    id: nextMissionId(),
    name: clean(body.name),
    agency: clean(body.agency),
    type: clean(body.type),
    vehicle: clean(body.vehicle),
    date: clean(body.date),
    status: normalizeStatus(body.status),
    crew: clean(body.crew),
    description: clean(body.description),
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO missions (id, name, agency, type, vehicle, date, status, crew, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    mission.id,
    mission.name,
    mission.agency,
    mission.type,
    mission.vehicle,
    mission.date,
    mission.status,
    mission.crew,
    mission.description,
    mission.createdAt,
    mission.updatedAt,
  );

  return mission;
}

function updateMission(id, body) {
  const current = findMissionById(id);
  if (!current) return null;

  const updated = {
    ...current,
    name: body.name !== undefined ? clean(body.name) : current.name,
    agency: body.agency !== undefined ? clean(body.agency) : current.agency,
    type: body.type !== undefined ? clean(body.type) : current.type,
    vehicle: body.vehicle !== undefined ? clean(body.vehicle) : current.vehicle,
    date: body.date !== undefined ? clean(body.date) : current.date,
    status:
      body.status !== undefined ? normalizeStatus(body.status) : current.status,
    crew: body.crew !== undefined ? clean(body.crew) : current.crew,
    description:
      body.description !== undefined
        ? clean(body.description)
        : current.description,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `
    UPDATE missions
    SET name = ?,
        agency = ?,
        type = ?,
        vehicle = ?,
        date = ?,
        status = ?,
        crew = ?,
        description = ?,
        updatedAt = ?
    WHERE id = ?
  `,
  ).run(
    updated.name,
    updated.agency,
    updated.type,
    updated.vehicle,
    updated.date,
    updated.status,
    updated.crew,
    updated.description,
    updated.updatedAt,
    updated.id,
  );

  return updated;
}

function deleteMissionById(id) {
  const mission = findMissionById(id);
  if (!mission) return null;

  db.prepare("DELETE FROM missions WHERE id = ?").run(clean(id));
  return mission;
}

function getMissionStats() {
  const total = db
    .prepare("SELECT COUNT(*) AS total FROM missions")
    .get().total;
  const active = db
    .prepare("SELECT COUNT(*) AS total FROM missions WHERE status = 'active'")
    .get().total;
  const completed = db
    .prepare(
      "SELECT COUNT(*) AS total FROM missions WHERE status = 'completed'",
    )
    .get().total;
  const failed = db
    .prepare(
      "SELECT COUNT(*) AS total FROM missions WHERE status IN ('failed', 'aborted')",
    )
    .get().total;

  return { total, active, completed, failedOrAborted: failed };
}

async function sendEvent(action, mission) {
  if (!config.sendEvents) {
    logger.info("EVENT_MANAGER_DISABLED", {
      action,
      missionId: mission?.id || "unknown",
    });
    return false;
  }

  try {
    await axios.post(
      config.eventManagerUrl,
      {
        source: "SpaceMissionControl",
        entity: "Mission",
        action: action.toUpperCase(),
        title: `[${action.toUpperCase()}] ${mission.name || mission.id || "Mission"}`,
        description: `Agencia: ${mission.agency || "system"} | Tipo: ${mission.type || "query"} | Estado: ${mission.status || "query"}`,
        payload: mission,
      },
      { timeout: config.eventManagerTimeoutMs },
    );
    logger.info("Evento enviado al Hub", {
      action,
      missionId: mission.id || "ALL",
    });
    return true;
  } catch (error) {
    logger.warn("No se pudo enviar evento al Hub", {
      action,
      missionId: mission?.id || "unknown",
      error: error.message,
    });
    return false;
  }
}

function corsOrigin(origin, callback) {
  if (
    !origin ||
    config.corsOrigins.includes("*") ||
    config.corsOrigins.includes(origin)
  ) {
    callback(null, true);
    return;
  }
  callback(new Error("Origen no permitido por CORS"));
}

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

function requireApiKey(req, res, next) {
  const publicPaths = ["/", "/health"];
  if (!config.requireApiKey || publicPaths.includes(req.path)) {
    next();
    return;
  }

  const providedKey = req.get(config.apiKeyHeader);
  if (providedKey !== config.apiKey) {
    logger.warn("API key ausente o invalida", {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });
    res
      .status(401)
      .json({ error: `Cabecera ${config.apiKeyHeader} inválida o ausente` });
    return;
  }

  next();
}

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

app.use(requireApiKey);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get(
  "/health",
  asyncRoute(async (req, res) => {
    let hub;
    try {
      const response = await axios.get(config.eventManagerHealthUrl, {
        timeout: config.eventManagerTimeoutMs,
      });
      hub = response.data?.status === "ok" ? "connected" : "error";
    } catch {
      hub = "offline";
    }

    res.json({
      status: "ok",
      api: "missions-crud",
      database: fs.existsSync(config.dbPath) ? "connected" : "not-found",
      hub,
      timestamp: new Date().toISOString(),
    });
  }),
);

app.get("/missions/stats", (req, res) => {
  audit(req, "STATS");
  res.json(getMissionStats());
});

app.post(
  "/missions",
  asyncRoute(async (req, res) => {
    const errors = validateMission(req.body);
    if (errors.length) {
      audit(req, "CREATE_REJECTED", { errors });
      return res.status(400).json({ error: errors.join(", ") });
    }

    const mission = insertMission(req.body);
    audit(req, "CREATE", { missionId: mission.id });
    await sendEvent("CREATE", mission);
    return res.status(201).json(mission);
  }),
);

app.get(
  "/missions",
  asyncRoute(async (req, res) => {
    const result = findAllMissions(req.query);
    audit(req, "QUERY_LIST", {
      total: result.pagination.total,
      filters: req.query,
    });
    await sendEvent("QUERY", {
      id: "ALL",
      name: "Consulta general de misiones",
      agency: "system",
      type: "query",
      status: "query",
      total: result.pagination.total,
    });
    return res.json(result);
  }),
);

app.get(
  "/missions/:id",
  asyncRoute(async (req, res) => {
    const mission = findMissionById(req.params.id);
    if (!mission) {
      audit(req, "QUERY_NOT_FOUND", { missionId: req.params.id });
      return res.status(404).json({ error: "Misión no encontrada" });
    }
    audit(req, "QUERY_ONE", { missionId: mission.id });
    await sendEvent("QUERY", mission);
    return res.json(mission);
  }),
);

app.put(
  "/missions/:id",
  asyncRoute(async (req, res) => {
    const exists = findMissionById(req.params.id);
    if (!exists) {
      audit(req, "UPDATE_NOT_FOUND", { missionId: req.params.id });
      return res.status(404).json({ error: "Misión no encontrada" });
    }

    const errors = validateMission(req.body, true);
    if (errors.length) {
      audit(req, "UPDATE_REJECTED", { missionId: req.params.id, errors });
      return res.status(400).json({ error: errors.join(", ") });
    }

    const updated = updateMission(req.params.id, req.body);
    audit(req, "UPDATE", { missionId: updated.id });
    await sendEvent("UPDATE", updated);
    return res.json(updated);
  }),
);

app.delete(
  "/missions/:id",
  asyncRoute(async (req, res) => {
    const deleted = deleteMissionById(req.params.id);
    if (!deleted) {
      audit(req, "DELETE_NOT_FOUND", { missionId: req.params.id });
      return res.status(404).json({ error: "Misión no encontrada" });
    }

    audit(req, "DELETE", { missionId: deleted.id });
    await sendEvent("DELETE", deleted);
    return res.json({ message: "Misión eliminada", mission: deleted });
  }),
);

app.use((req, res) => {
  logger.warn("Ruta no encontrada", {
    method: req.method,
    path: req.originalUrl,
  });
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.use((error, req, res, _next) => {
  void _next;

  logger.error("Error no controlado en ruta", {
    method: req.method,
    path: req.originalUrl,
    error: error.message,
  });

  res.status(500).json({ error: "Error interno del servidor" });
});

function startServer() {
  return app.listen(config.port, () => {
    logger.info("Space Mission Control iniciado", {
      port: config.port,
      database: config.dbPath,
      eventManagerUrl: config.eventManagerUrl,
      requireApiKey: config.requireApiKey,
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  clean,
  normalizeStatus,
  validateMission,
  hasBlockedContent,
  isValidIsoDate,
  getMissionStats,
  buildMissionWhere,
  findAllMissions,
  findMissionById,
  insertMission,
  updateMission,
  deleteMissionById,
  sendEvent,
  logger,
  config,
  startServer,
};
