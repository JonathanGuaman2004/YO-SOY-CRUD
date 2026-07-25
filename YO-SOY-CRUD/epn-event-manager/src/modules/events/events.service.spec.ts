import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

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
  create: jest.Mock<EventRecordForTest, [EventRecordForTest]>;
  save: jest.Mock<Promise<EventRecordForTest>, [EventRecordForTest]>;
  find: jest.Mock<Promise<EventRecordForTest[]>, []>;
  findBy: jest.Mock<
    Promise<EventRecordForTest[]>,
    [Partial<EventRecordForTest>]
  >;
  count: jest.Mock<Promise<number>, []>;
};

function createMockRepository(): MockRepository {
  return {
    create: jest.fn<EventRecordForTest, [EventRecordForTest]>((data) => data),
    save: jest.fn<Promise<EventRecordForTest>, [EventRecordForTest]>((data) =>
      Promise.resolve(data),
    ),
    find: jest.fn<Promise<EventRecordForTest[]>, []>(),
    findBy: jest.fn<
      Promise<EventRecordForTest[]>,
      [Partial<EventRecordForTest>]
    >(),
    count: jest.fn<Promise<number>, []>(),
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

  it('debe calcular estadísticas incluyendo QUERY', async () => {
    createRepo.count.mockResolvedValue(2);
    updateRepo.count.mockResolvedValue(1);
    deleteRepo.count.mockResolvedValue(1);
    queryRepo.count.mockResolvedValue(3);

    const stats = await service.getStats();

    expect(stats).toEqual({
      create: 2,
      update: 1,
      delete: 1,
      query: 3,
      total: 7,
    });
  });

  it('debe listar eventos normalizados y ordenados por fecha', async () => {
    createRepo.find.mockResolvedValue([
      {
        id: 1,
        source: 'SystemA',
        entity: 'EntityA',
        action: 'CREATE',
        title: 'Evento antiguo',
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
        event_date: '2026-05-17T12:00:00.000Z',
      },
    ]);

    const events = await service.findAll();

    expect(events).toHaveLength(3);

    expect(events[0]).toEqual(
      expect.objectContaining({
        _table: 'query_events',
        _eventDate: '2026-05-17T12:00:00.000Z',
      }),
    );

    expect(events[1]).toEqual(
      expect.objectContaining({
        _table: 'update_events',
        _eventDate: '2026-05-17T11:00:00.000Z',
      }),
    );

    expect(events[2]).toEqual(
      expect.objectContaining({
        _table: 'create_events',
        _eventDate: '2026-05-17T10:00:00.000Z',
      }),
    );
  });
});
