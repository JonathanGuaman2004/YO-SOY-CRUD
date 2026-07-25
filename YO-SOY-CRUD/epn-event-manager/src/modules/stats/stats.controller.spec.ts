import { Test, TestingModule } from '@nestjs/testing';
import { StatsController } from './stats.controller';
import { EventsService } from '../events/events.service';

describe('StatsController', () => {
  let controller: StatsController;
  const eventsService = {
    getStats: jest.fn().mockResolvedValue({
      create: 1,
      update: 0,
      delete: 0,
      query: 0,
      total: 1,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [{ provide: EventsService, useValue: eventsService }],
    }).compile();
    controller = module.get(StatsController);
  });

  it('GET /stats devuelve el conteo del service', async () => {
    const res = await controller.getStats();
    expect(res).toEqual({
      create: 1,
      update: 0,
      delete: 0,
      query: 0,
      total: 1,
    });
    expect(eventsService.getStats).toHaveBeenCalled();
  });
});
