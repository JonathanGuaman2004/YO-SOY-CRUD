import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    const databaseConnected = this.dataSource.isInitialized;

    if (databaseConnected) {
      await this.dataSource.query('SELECT 1');
    }

    return {
      status: databaseConnected ? 'ok' : 'error',
      database: databaseConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }
}
