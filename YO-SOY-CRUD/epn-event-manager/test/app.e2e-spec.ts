import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from './../src/app.module';

describe('EPN Event Manager (e2e)', () => {
  let app: INestApplication;
  let http: Parameters<typeof supertest>[0];

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    http = app.getHttpServer() as Parameters<typeof supertest>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------- TC-EM-04-001: Registrar un evento válido ----------
  describe('POST /events (CREATE, UPDATE, DELETE, QUERY)', () => {
    it('TC-EM-04-001: registra un evento CREATE válido y responde 201', async () => {
      const res = await supertest(http)
        .post('/events')
        .send({
          source: 'external-crud',
          entity: 'user',
          action: 'CREATE',
          title: 'Nuevo usuario',
          description: 'Se creó un usuario',
          payload: { id: 'U-001', name: 'Ana' },
        })
        .expect(201);

      expect(res.body as { ok: boolean; action: string }).toEqual({
        ok: true,
        action: 'CREATE',
      });
    });

    it('registra un evento UPDATE válido', async () => {
      const res = await supertest(http)
        .post('/events')
        .send({
          source: 'external-crud',
          entity: 'user',
          action: 'UPDATE',
          title: 'Usuario editado',
          payload: { id: 'U-001', name: 'Ana María' },
        })
        .expect(201);

      expect(res.body).toEqual({ ok: true, action: 'UPDATE' });
    });

    it('registra un evento DELETE válido', async () => {
      const res = await supertest(http)
        .post('/events')
        .send({
          source: 'external-crud',
          entity: 'user',
          action: 'DELETE',
          title: 'Usuario eliminado',
          payload: { id: 'U-001' },
        })
        .expect(201);

      expect(res.body).toEqual({ ok: true, action: 'DELETE' });
    });

    it('registra un evento QUERY (permite payload vacío)', async () => {
      const res = await supertest(http)
        .post('/events')
        .send({
          source: 'external-crud',
          entity: 'user',
          action: 'QUERY',
          title: 'Consulta de usuarios',
        })
        .expect(201);

      expect(res.body).toEqual({ ok: true, action: 'QUERY' });
    });
  });

  // ---------- TC-EM-04-002: Registrar una acción inválida ----------
  describe('POST /events - errores de validación', () => {
    it('TC-EM-04-002: rechaza acción inválida con HTTP 400', async () => {
      await supertest(http)
        .post('/events')
        .send({
          source: 'external-crud',
          entity: 'user',
          action: 'INVALID_ACTION',
          title: 'X',
          payload: { id: '1' },
        })
        .expect(400);
    });

    it('rechaza CREATE sin payload con HTTP 400', async () => {
      await supertest(http)
        .post('/events')
        .send({
          source: 'external-crud',
          entity: 'user',
          action: 'CREATE',
          title: 'Sin payload',
        })
        .expect(400);
    });

    it('rechaza campos requeridos vacíos', async () => {
      await supertest(http)
        .post('/events')
        .send({ source: '', entity: '', action: 'CREATE', title: '' })
        .expect(400);
    });

    it('rechaza campos extra no permitidos (whitelist)', async () => {
      await supertest(http)
        .post('/events')
        .send({
          source: 'external-crud',
          entity: 'user',
          action: 'QUERY',
          title: 'Con basura',
          extraCampo: 'no permitido',
        })
        .expect(400);
    });
  });

  // ---------- GET endpoints ----------
  interface StoredEventResponse {
    source: string;
    entity: string;
    action: string;
    title: string;
  }

  describe('GET /events y filtros', () => {
    it('GET /events devuelve la lista normalizada', async () => {
      const res = await supertest(http).get('/events').expect(200);
      const body = res.body as StoredEventResponse[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it('GET /events/source/:source filtra por source', async () => {
      const res = await supertest(http)
        .get('/events/source/external-crud')
        .expect(200);
      const body = res.body as StoredEventResponse[];
      expect(Array.isArray(body)).toBe(true);
      body.forEach((ev) => {
        expect(ev.source).toBe('external-crud');
      });
    });

    it('GET /events/entity/:entity filtra por entity', async () => {
      const res = await supertest(http).get('/events/entity/user').expect(200);
      const body = res.body as StoredEventResponse[];
      expect(Array.isArray(body)).toBe(true);
      body.forEach((ev) => {
        expect(ev.entity).toBe('user');
      });
    });
  });

  interface StatsResponse {
    create: number;
    update: number;
    delete: number;
    query: number;
    total: number;
  }

  describe('GET /stats', () => {
    it('devuelve el conteo agregado por acción', async () => {
      const res = await supertest(http).get('/stats').expect(200);
      const body = res.body as StatsResponse;

      expect(typeof body.create).toBe('number');
      expect(typeof body.update).toBe('number');
      expect(typeof body.delete).toBe('number');
      expect(typeof body.query).toBe('number');
      expect(typeof body.total).toBe('number');

      expect(body.total).toBe(
        body.create + body.update + body.delete + body.query,
      );
    });
  });

  interface HealthResponse {
    status: string;
    database: string;
    timestamp: string;
  }

  describe('GET /health', () => {
    it('responde ok cuando la BD está inicializada', async () => {
      const res = await supertest(http).get('/health').expect(200);
      const body = res.body as HealthResponse;
      expect(body.status).toBe('ok');
      expect(body.database).toBe('connected');
      expect(typeof body.timestamp).toBe('string');
    });
  });
});
