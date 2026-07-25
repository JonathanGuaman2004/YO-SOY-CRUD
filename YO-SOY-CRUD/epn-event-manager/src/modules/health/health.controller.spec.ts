import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('devuelve ok cuando la BD está inicializada', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ 1: 1 }]),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: dataSource }],
    }).compile();

    const controller = module.get(HealthController);
    const res = await controller.check();
    expect(res.status).toBe('ok');
    expect(res.database).toBe('connected');
  });

  it('devuelve error cuando la BD no está inicializada', async () => {
    const dataSource = {
      isInitialized: false,
      query: jest.fn(),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: dataSource }],
    }).compile();

    const controller = module.get(HealthController);
    const res = await controller.check();
    expect(res.status).toBe('error');
    expect(res.database).toBe('disconnected');
  });
});
