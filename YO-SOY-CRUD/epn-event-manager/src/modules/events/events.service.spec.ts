import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { jest } from '@jest/globals';

import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';

type EventRecordForTest = Record<
  string,
  string | number | boolean | Record<string, unknown> | undefined
>;

type MockRepository = {
  create: jest.MockedFunction<(data: EventRecordForTest) => EventRecordForTest>;
  save: jest.MockedFunction<
    (data: EventRecordForTest) => Promise<EventRecordForTest>
  >;
  find: jest.MockedFunction<() => Promise<EventRecordForTest[]>>;
  findBy: jest.MockedFunction<
    (criteria: Partial<EventRecordForTest>) => Promise<EventRecordForTest[]>
  >;
  count: jest.MockedFunction<() => Promise<number>>;
};

function createMockRepository(): MockRepository {
  return {
    create: jest.fn<(data: EventRecordForTest) => EventRecordForTest>(
      (data) => data,
    ),
    save: jest.fn<(data: EventRecordForTest) => Promise<EventRecordForTest>>(
      (data) => Promise.resolve(data),
    ),
    find: jest.fn<() => Promise<EventRecordForTest[]>>(),
    findBy:
      jest.fn<
        (criteria: Partial<EventRecordForTest>) => Promise<EventRecordForTest[]>
      >(),
    count: jest.fn<() => Promise<number>>(),
  };
}

describe('EventsService', () => {
  let service: EventsService;

  let createRepo: MockRepository;
  let updateRepo: MockRepository;
  let deleteRepo: MockRepository;
  let queryRepo: MockRepository;

  beforeEach(async () => {
    createRepo = createMockRepository();
    updateRepo = createMockRepository();
    deleteRepo = createMockRepository();
    queryRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(CreateEventEntity),
          useValue: createRepo,
        },
        {
          provide: getRepositoryToken(UpdateEventEntity),
          useValue: updateRepo,
        },
        {
          provide: getRepositoryToken(DeleteEventEntity),
          useValue: deleteRepo,
        },
        {
          provide: getRepositoryToken(QueryEventEntity),
          useValue: queryRepo,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('debe registrar un evento CREATE de cualquier sistema externo', async () => {
    const dto: CreateEventDto = {
      source: 'ExternalCrudSystem',
      entity: 'GenericEntity',
      action: 'CREATE',
      title: 'Crear registro genérico',
      description: 'Evento generado al crear un registro en un CRUD externo',
      payload: {
        id: 'GEN-001',
        name: 'Registro de prueba',
      },
    };

    const result = await service.registerEvent(dto);

    expect(result).toEqual({
      ok: true,
      action: 'CREATE',
    });

    expect(createRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ExternalCrudSystem',
        entity: 'GenericEntity',
        action: 'CREATE',
        title: 'Crear registro genérico',
        description: 'Evento generado al crear un registro en un CRUD externo',
        payload: JSON.stringify({
          id: 'GEN-001',
          name: 'Registro de prueba',
        }),
        recorded_at: expect.any(String),
      }),
    );

    expect(createRepo.save).toHaveBeenCalledTimes(1);
    expect(updateRepo.save).not.toHaveBeenCalled();
    expect(deleteRepo.save).not.toHaveBeenCalled();
    expect(queryRepo.save).not.toHaveBeenCalled();
  });

  it('debe rechazar CREATE si no tiene payload', async () => {
    const dto: CreateEventDto = {
      source: 'ExternalCrudSystem',
      entity: 'GenericEntity',
      action: 'CREATE',
      title: 'Evento sin payload',
    };

    await expect(service.registerEvent(dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('debe permitir QUERY sin payload', async () => {
    const dto: CreateEventDto = {
      source: 'ExternalCrudSystem',
      entity: 'GenericEntity',
      action: 'QUERY',
      title: 'Consulta general sin payload',
    };

    const result = await service.registerEvent(dto);

    expect(result).toEqual({
      ok: true,
      action: 'QUERY',
    });

    expect(queryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ExternalCrudSystem',
        entity: 'GenericEntity',
        action: 'QUERY',
        title: 'Consulta general sin payload',
        description: '',
        payload: '{}',
        query_term: '',
        event_date: expect.any(String),
      }),
    );

    expect(queryRepo.save).toHaveBeenCalledTimes(1);
  });

  it('debe registrar un evento UPDATE de cualquier entidad', async () => {
    const dto: CreateEventDto = {
      source: 'ExternalCrudSystem',
      entity: 'GenericEntity',
      action: 'UPDATE',
      title: 'Actualizar registro genérico',
      description: 'Evento generado al actualizar un registro',
      payload: {
        id: 'GEN-001',
        name: 'Registro actualizado',
      },
    };

    const result = await service.registerEvent(dto);

    expect(result).toEqual({
      ok: true,
      action: 'UPDATE',
    });

    expect(updateRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ExternalCrudSystem',
        entity: 'GenericEntity',
        action: 'UPDATE',
        title: 'Actualizar registro genérico',
        description: 'Evento generado al actualizar un registro',
        payload: JSON.stringify({
          id: 'GEN-001',
          name: 'Registro actualizado',
        }),
        timestamp: expect.any(String),
      }),
    );

    expect(updateRepo.save).toHaveBeenCalledTimes(1);
  });

  it('debe registrar un evento DELETE de cualquier entidad', async () => {
    const dto: CreateEventDto = {
      source: 'ExternalCrudSystem',
      entity: 'GenericEntity',
      action: 'DELETE',
      title: 'Eliminar registro genérico',
      description: 'Evento generado al eliminar un registro',
      payload: {
        id: 'GEN-001',
        name: 'Registro eliminado',
      },
    };

    const result = await service.registerEvent(dto);

    expect(result).toEqual({
      ok: true,
      action: 'DELETE',
    });

    expect(deleteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ExternalCrudSystem',
        entity: 'GenericEntity',
        action: 'DELETE',
        title: 'Eliminar registro genérico',
        description: 'Evento generado al eliminar un registro',
        payload: JSON.stringify({
          id: 'GEN-001',
          name: 'Registro eliminado',
        }),
        createdAt: expect.any(String),
      }),
    );

    expect(deleteRepo.save).toHaveBeenCalledTimes(1);
  });

  it('TC-EM-02-001: debe devolver estadísticas agrupadas por acción, source, entity y día', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'SourceA',
        entity: 'EntityX',
        action: 'CREATE',
        title: 'Crear 1',
        recorded_at: '2026-07-01T10:00:00.000Z',
      },
      {
        id: 2,
        source: 'SourceB',
        entity: 'EntityY',
        action: 'CREATE',
        title: 'Crear 2',
        recorded_at: '2026-07-02T10:00:00.000Z',
      },
    ]);

    updateRepo.find.mockResolvedValue([
      {
        id: 3,
        source: 'SourceA',
        entity: 'EntityX',
        action: 'UPDATE',
        title: 'Actualizar 1',
        timestamp: '2026-07-01T11:00:00.000Z',
      },
    ]);

    deleteRepo.find.mockResolvedValue([
      {
        id: 4,
        source: 'SourceB',
        entity: 'EntityY',
        action: 'DELETE',
        title: 'Eliminar 1',
        createdAt: '2026-07-02T11:00:00.000Z',
      },
    ]);

    queryRepo.find.mockResolvedValue([
      {
        id: 5,
        source: 'SourceA',
        entity: 'EntityX',
        action: 'QUERY',
        title: 'Consultar 1',
        event_date: '2026-07-01T12:00:00.000Z',
      },
      {
        id: 6,
        source: 'SourceA',
        entity: 'EntityX',
        action: 'QUERY',
        title: 'Consultar 2',
        event_date: '2026-07-03T10:00:00.000Z',
      },
    ]);

    const stats = await service.getStats();

    expect(stats).toEqual({
      byAction: { create: 2, update: 1, delete: 1, query: 2, total: 6 },
      bySource: { SourceA: 4, SourceB: 2 },
      byEntity: { EntityX: 4, EntityY: 2 },
      byDay: {
        '2026-07-01': 3,
        '2026-07-02': 2,
        '2026-07-03': 1,
      },
    });
  });

  it('TC-EM-02-002: debe filtrar estadísticas por source', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'SourceA',
        entity: 'EntityX',
        action: 'CREATE',
        title: 'Crear A',
        recorded_at: '2026-07-01T10:00:00.000Z',
      },
      {
        id: 2,
        source: 'SourceB',
        entity: 'EntityY',
        action: 'CREATE',
        title: 'Crear B',
        recorded_at: '2026-07-02T10:00:00.000Z',
      },
    ]);

    updateRepo.find.mockResolvedValue([]);
    deleteRepo.find.mockResolvedValue([]);
    queryRepo.find.mockResolvedValue([]);

    const stats = await service.getStats({ source: 'SourceA' });

    expect(stats).toEqual({
      byAction: { create: 1, update: 0, delete: 0, query: 0, total: 1 },
      bySource: { SourceA: 1 },
      byEntity: { EntityX: 1 },
      byDay: { '2026-07-01': 1 },
    });
  });

  it('TC-EM-02-003: debe filtrar estadísticas por rango de fechas', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'SourceA',
        entity: 'EntityX',
        action: 'CREATE',
        title: 'Crear viejo',
        recorded_at: '2026-06-15T10:00:00.000Z',
      },
      {
        id: 2,
        source: 'SourceA',
        entity: 'EntityX',
        action: 'CREATE',
        title: 'Crear Julio',
        recorded_at: '2026-07-15T10:00:00.000Z',
      },
      {
        id: 3,
        source: 'SourceA',
        entity: 'EntityX',
        action: 'CREATE',
        title: 'Crear futuro',
        recorded_at: '2026-08-15T10:00:00.000Z',
      },
    ]);

    updateRepo.find.mockResolvedValue([]);
    deleteRepo.find.mockResolvedValue([]);
    queryRepo.find.mockResolvedValue([]);

    const stats = await service.getStats({
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(stats).toEqual({
      byAction: { create: 1, update: 0, delete: 0, query: 0, total: 1 },
      bySource: { SourceA: 1 },
      byEntity: { EntityX: 1 },
      byDay: { '2026-07-15': 1 },
    });
  });

  it('TC-EM-02-004: debe rechazar fecha inválida en from', async () => {
    await expect(service.getStats({ from: 'fecha-invalida' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('debe devolver totales en cero cuando no hay eventos', async () => {
    createRepo.find.mockResolvedValue([]);
    updateRepo.find.mockResolvedValue([]);
    deleteRepo.find.mockResolvedValue([]);
    queryRepo.find.mockResolvedValue([]);

    const stats = await service.getStats();

    expect(stats).toEqual({
      byAction: { create: 0, update: 0, delete: 0, query: 0, total: 0 },
      bySource: {},
      byEntity: {},
      byDay: {},
    });
  });

  it('debe listar eventos normalizados, ordenados y paginados por fecha', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'SystemA',
        entity: 'EntityA',
        action: 'CREATE',
        title: 'Evento antiguo',
        description: 'Evento CREATE',
        payload: JSON.stringify({ id: 'A-001' }),
        recorded_at: '2026-05-17T10:00:00.000Z',
      },
    ]);

    updateRepo.find.mockResolvedValue([
      {
        id: 2,
        source: 'SystemB',
        entity: 'EntityB',
        action: 'UPDATE',
        title: 'Evento intermedio',
        description: 'Evento UPDATE',
        payload: JSON.stringify({ id: 'B-001' }),
        timestamp: '2026-05-17T11:00:00.000Z',
      },
    ]);

    deleteRepo.find.mockResolvedValue([]);

    queryRepo.find.mockResolvedValue([
      {
        id: 3,
        source: 'SystemC',
        entity: 'EntityC',
        action: 'QUERY',
        title: 'Evento reciente',
        description: 'Evento QUERY',
        payload: JSON.stringify({ query: 'prueba' }),
        event_date: '2026-05-17T12:00:00.000Z',
      },
    ]);

    const result = await service.findAll({
      limit: '2',
      offset: '0',
    });

    expect(result.data).toHaveLength(2);

    expect(result.pagination).toEqual({
      total: 3,
      limit: 2,
      offset: 0,
      returned: 2,
      hasNextPage: true,
    });

    expect(result.data[0]).toEqual({
      id: 3,
      source: 'SystemC',
      entity: 'EntityC',
      action: 'QUERY',
      title: 'Evento reciente',
      description: 'Evento QUERY',
      payload: {
        query: 'prueba',
      },
      occurredAt: '2026-05-17T12:00:00.000Z',
    });

    expect(result.data[1]).toEqual({
      id: 2,
      source: 'SystemB',
      entity: 'EntityB',
      action: 'UPDATE',
      title: 'Evento intermedio',
      description: 'Evento UPDATE',
      payload: {
        id: 'B-001',
      },
      occurredAt: '2026-05-17T11:00:00.000Z',
    });

    expect(result.data[0]).not.toHaveProperty('_table');
    expect(result.data[0]).not.toHaveProperty('_eventDate');
    expect(result.data[0]).not.toHaveProperty('event_date');

    expect(result.data[1]).not.toHaveProperty('_table');
    expect(result.data[1]).not.toHaveProperty('_eventDate');
    expect(result.data[1]).not.toHaveProperty('timestamp');
  });

  it('debe filtrar eventos por source y action', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'SpaceMissionControl',
        entity: 'Mission',
        action: 'CREATE',
        title: 'Crear misión',
        description: 'Misión creada',
        payload: JSON.stringify({ id: 'A-001' }),
        recorded_at: '2026-05-17T10:00:00.000Z',
      },
      {
        id: 2,
        source: 'OtherSystem',
        entity: 'Mission',
        action: 'CREATE',
        title: 'Crear externo',
        description: 'Registro externo',
        payload: JSON.stringify({ id: 'B-001' }),
        recorded_at: '2026-05-17T11:00:00.000Z',
      },
    ]);

    updateRepo.find.mockResolvedValue([
      {
        id: 3,
        source: 'SpaceMissionControl',
        entity: 'Mission',
        action: 'UPDATE',
        title: 'Actualizar misión',
        description: 'Misión actualizada',
        payload: JSON.stringify({ id: 'A-001' }),
        timestamp: '2026-05-17T12:00:00.000Z',
      },
    ]);

    deleteRepo.find.mockResolvedValue([]);
    queryRepo.find.mockResolvedValue([]);

    const result = await service.findAll({
      source: 'SpaceMissionControl',
      action: 'CREATE',
    });

    expect(result.data).toHaveLength(1);

    expect(result.data[0]).toEqual({
      id: 1,
      source: 'SpaceMissionControl',
      entity: 'Mission',
      action: 'CREATE',
      title: 'Crear misión',
      description: 'Misión creada',
      payload: {
        id: 'A-001',
      },
      occurredAt: '2026-05-17T10:00:00.000Z',
    });

    expect(result.pagination.total).toBe(1);
  });

  it('debe usar el mismo contrato para CREATE, UPDATE, DELETE y QUERY', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'SystemA',
        entity: 'EntityA',
        action: 'CREATE',
        title: 'Crear',
        description: 'Descripción CREATE',
        payload: '{"id":"A-001"}',
        recorded_at: '2026-05-17T10:00:00.000Z',
      },
    ]);

    updateRepo.find.mockResolvedValue([
      {
        id: 2,
        source: 'SystemA',
        entity: 'EntityA',
        action: 'UPDATE',
        title: 'Actualizar',
        description: 'Descripción UPDATE',
        payload: '{"id":"A-001"}',
        timestamp: '2026-05-17T11:00:00.000Z',
      },
    ]);

    deleteRepo.find.mockResolvedValue([
      {
        id: 3,
        source: 'SystemA',
        entity: 'EntityA',
        action: 'DELETE',
        title: 'Eliminar',
        description: 'Descripción DELETE',
        payload: '{"id":"A-001"}',
        createdAt: '2026-05-17T12:00:00.000Z',
      },
    ]);

    queryRepo.find.mockResolvedValue([
      {
        id: 4,
        source: 'SystemA',
        entity: 'EntityA',
        action: 'QUERY',
        title: 'Consultar',
        description: 'Descripción QUERY',
        payload: '{"query":"prueba"}',
        query_term: 'prueba',
        event_date: '2026-05-17T13:00:00.000Z',
      },
    ]);

    const result = await service.findAll();

    expect(result.data).toHaveLength(4);

    for (const event of result.data) {
      expect(event).toEqual({
        id: expect.any(Number),
        source: expect.any(String),
        entity: expect.any(String),
        action: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        payload: expect.any(Object),
        occurredAt: expect.any(String),
      });

      expect(event).not.toHaveProperty('_table');
      expect(event).not.toHaveProperty('_eventDate');
      expect(event).not.toHaveProperty('recorded_at');
      expect(event).not.toHaveProperty('timestamp');
      expect(event).not.toHaveProperty('createdAt');
      expect(event).not.toHaveProperty('event_date');
      expect(event).not.toHaveProperty('query_term');
    }
  });

  it('debe manejar un payload malformado sin generar error', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'SystemA',
        entity: 'EntityA',
        action: 'CREATE',
        title: 'Evento con payload inválido',
        description: '',
        payload: '{json-invalido',
        recorded_at: '2026-05-17T10:00:00.000Z',
      },
    ]);

    updateRepo.find.mockResolvedValue([]);
    deleteRepo.find.mockResolvedValue([]);
    queryRepo.find.mockResolvedValue([]);

    const result = await service.findAll();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].payload).toEqual({});
    expect(result.data[0].occurredAt).toBe('2026-05-17T10:00:00.000Z');
  });

  it('debe aplicar una fecha segura cuando la fecha almacenada es inválida', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'SystemA',
        entity: 'EntityA',
        action: 'CREATE',
        title: 'Evento con fecha inválida',
        description: '',
        payload: '{}',
        recorded_at: 'fecha-invalida',
      },
    ]);

    updateRepo.find.mockResolvedValue([]);
    deleteRepo.find.mockResolvedValue([]);
    queryRepo.find.mockResolvedValue([]);

    const result = await service.findAll();

    expect(result.data[0].occurredAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('debe consultar eventos normalizados por source', async () => {
    createRepo.findBy.mockResolvedValue([
      {
        id: 1,
        source: 'SpaceMissionControl',
        entity: 'Mission',
        action: 'CREATE',
        title: 'Crear misión',
        description: 'Misión creada',
        payload: '{"id":"MSN-0001"}',
        recorded_at: '2026-05-17T10:00:00.000Z',
      },
    ]);

    updateRepo.findBy.mockResolvedValue([]);
    deleteRepo.findBy.mockResolvedValue([]);
    queryRepo.findBy.mockResolvedValue([]);

    const result = await service.findBySource('SpaceMissionControl');

    expect(result).toHaveLength(1);

    expect(result[0]).toEqual({
      id: 1,
      source: 'SpaceMissionControl',
      entity: 'Mission',
      action: 'CREATE',
      title: 'Crear misión',
      description: 'Misión creada',
      payload: {
        id: 'MSN-0001',
      },
      occurredAt: '2026-05-17T10:00:00.000Z',
    });
  });

  it('debe rechazar una consulta con source vacío', async () => {
    await expect(service.findBySource('   ')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('debe rechazar una consulta con entity vacía', async () => {
    await expect(service.findByEntity('   ')).rejects.toThrow(
      BadRequestException,
    );
  });
  it('debe filtrar eventos por source', async () => {
    createRepo.findBy.mockResolvedValue([]);
    updateRepo.findBy.mockResolvedValue([]);
    deleteRepo.findBy.mockResolvedValue([]);
    queryRepo.findBy.mockResolvedValue([]);

    const events = await service.findBySource('SystemA');
    expect(events).toEqual([]);
    expect(createRepo.findBy).toHaveBeenCalledWith({ source: 'SystemA' });
  });

  it('debe rechazar source vacío', async () => {
    await expect(service.findBySource('   ')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('debe filtrar eventos por entity', async () => {
    createRepo.findBy.mockResolvedValue([]);
    updateRepo.findBy.mockResolvedValue([]);
    deleteRepo.findBy.mockResolvedValue([]);
    queryRepo.findBy.mockResolvedValue([]);

    const events = await service.findByEntity('EntityX');
    expect(events).toEqual([]);
    expect(updateRepo.findBy).toHaveBeenCalledWith({ entity: 'EntityX' });
  });

  it('debe rechazar entity vacío', async () => {
    await expect(service.findByEntity('')).rejects.toThrow(BadRequestException);
  });

  it('debe extraer query_term desde distintos alias del payload', async () => {
    const base = {
      source: 'S',
      entity: 'E',
      action: 'QUERY' as const,
      title: 'T',
    };

    await service.registerEvent({ ...base, payload: { query: 'foo' } });
    expect(queryRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ query_term: 'foo' }),
    );

    await service.registerEvent({ ...base, payload: { filtro: 'bar' } });
    expect(queryRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ query_term: 'bar' }),
    );

    await service.registerEvent({ ...base, payload: { name: 'baz' } });
    expect(queryRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ query_term: 'baz' }),
    );
  });
  it('extractQueryTerm usa data.id cuando no hay query ni filtro', async () => {
    await service.registerEvent({
      source: 'S',
      entity: 'E',
      action: 'QUERY',
      title: 'con id',
      payload: { id: 'ID-123' },
    });
    expect(queryRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ query_term: 'ID-123' }),
    );
  });

  it('extractQueryTerm devuelve cadena vacía cuando el payload es null', async () => {
    await service.registerEvent({
      source: 'S',
      entity: 'E',
      action: 'QUERY',
      title: 'payload null',
      payload: null as unknown as Record<string, unknown>,
    });
    expect(queryRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ query_term: '' }),
    );
  });

  it('normaliza eventos con fecha inválida o ausente sin romperse', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'S',
        entity: 'E',
        action: 'CREATE',
        title: 'sin fecha',
        recorded_at: undefined,
      },
    ]);
    updateRepo.find.mockResolvedValue([
      {
        id: 2,
        source: 'S',
        entity: 'E',
        action: 'UPDATE',
        title: 'fecha inválida',
        timestamp: 'esto-no-es-una-fecha',
      },
    ]);
    deleteRepo.find.mockResolvedValue([]);
    queryRepo.find.mockResolvedValue([]);

    const events = await service.findAll();
    expect(events.data).toHaveLength(2);
    expect(events.pagination.total).toBe(2);
  });
});
