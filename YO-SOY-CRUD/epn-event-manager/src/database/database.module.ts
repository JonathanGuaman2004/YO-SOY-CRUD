import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateEventEntity } from './entities/create-event.entity';
import { UpdateEventEntity } from './entities/update-event.entity';
import { DeleteEventEntity } from './entities/delete-event.entity';
import { QueryEventEntity } from './entities/query-event.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.get<string>('DB_PATH') ?? 'db/events.sqlite',
        entities: [
          CreateEventEntity,
          UpdateEventEntity,
          DeleteEventEntity,
          QueryEventEntity,
        ],
        synchronize: true,
        dropSchema: config.get<string>('DB_PATH') === ':memory:',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
