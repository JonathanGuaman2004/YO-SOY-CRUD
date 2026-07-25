import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

describe('EventsController', () => {
  let controller: EventsController;
  let service: jest.Mocked<Partial<EventsService>>;

  beforeEach(async () => {
    service = {
      registerEvent: jest
        .fn()
        .mockResolvedValue({ ok: true, action: 'CREATE' }),
      findAll: jest.fn().mockResolvedValue([]),
      findBySource: jest.fn().mockResolvedValue([]),
      findByEntity: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: service }],
    }).compile();

    controller = module.get(EventsController);
  });

  it('POST /events delega en service.registerEvent', async () => {
    const dto = {
      source: 'S',
      entity: 'E',
      action: 'CREATE',
      title: 'T',
      payload: { id: '1' },
    };
    const res = await controller.registerEvent(dto);
    expect(service.registerEvent).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ ok: true, action: 'CREATE' });
  });

  it('GET /events delega en service.findAll', async () => {
    await controller.findAll({});
    expect(service.findAll).toHaveBeenCalled();
  });

  it('GET /events/source/:source delega en service.findBySource', async () => {
    await controller.findBySource('X');
    expect(service.findBySource).toHaveBeenCalledWith('X');
  });

  it('GET /events/entity/:entity delega en service.findByEntity', async () => {
    await controller.findByEntity('Y');
    expect(service.findByEntity).toHaveBeenCalledWith('Y');
  });
});
