import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';

type StoredEvent = Record<string, unknown> & {
  _table?: string;
  _eventDate?: string;
};

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(CreateEventEntity)
    private readonly createRepo: Repository<CreateEventEntity>,
    @InjectRepository(UpdateEventEntity)
    private readonly updateRepo: Repository<UpdateEventEntity>,
    @InjectRepository(DeleteEventEntity)
    private readonly deleteRepo: Repository<DeleteEventEntity>,
    @InjectRepository(QueryEventEntity)
    private readonly queryRepo: Repository<QueryEventEntity>,
  ) {}

  async registerEvent(
    dto: CreateEventDto,
  ): Promise<{ ok: boolean; action: string }> {
    const action = dto.action;
    this.validatePayloadForAction(dto, action);

    const payloadStr = JSON.stringify(dto.payload ?? {});
    const eventDate = new Date().toISOString();
    const baseData = {
      source: this.clean(dto.source),
      entity: this.clean(dto.entity),
      action,
      title: this.clean(dto.title),
      description: this.clean(dto.description ?? ''),
      payload: payloadStr,
    };

    if (action === 'CREATE') {
      const ev = this.createRepo.create({
        ...baseData,
        recorded_at: eventDate,
      });
      await this.createRepo.save(ev);
      return { ok: true, action };
    }

    if (action === 'UPDATE') {
      const ev = this.updateRepo.create({
        ...baseData,
        timestamp: eventDate,
      });
      await this.updateRepo.save(ev);
      return { ok: true, action };
    }

    if (action === 'DELETE') {
      const ev = this.deleteRepo.create({
        ...baseData,
        createdAt: eventDate,
      });
      await this.deleteRepo.save(ev);
      return { ok: true, action };
    }

    const ev = this.queryRepo.create({
      ...baseData,
      query_term: this.extractQueryTerm(dto.payload),
      event_date: eventDate,
    });
    await this.queryRepo.save(ev);
    return { ok: true, action };
  }

  //Evita repetición de código para obtener eventos de las 4 tablas, y normalizarlos a un formato común para ordenarlos por fecha
  async findAll(): Promise<object[]> {
    const creates = await this.createRepo.find();
    const updates = await this.updateRepo.find();
    const deletes = await this.deleteRepo.find();
    const queries = await this.queryRepo.find();

    return this.normalizeEvents(creates, updates, deletes, queries);
  }

  async findBySource(source: string): Promise<object[]> {
    const safeSource = this.clean(source);
    if (!safeSource) throw new BadRequestException('source inválido');

    const creates = await this.createRepo.findBy({ source: safeSource });
    const updates = await this.updateRepo.findBy({ source: safeSource });
    const deletes = await this.deleteRepo.findBy({ source: safeSource });
    const queries = await this.queryRepo.findBy({ source: safeSource });

    return this.normalizeEvents(creates, updates, deletes, queries);
  }

  //
  async findByEntity(entity: string): Promise<object[]> {
    const safeEntity = this.clean(entity);
    if (!safeEntity) throw new BadRequestException('entity inválido');

    const creates = await this.createRepo.findBy({ entity: safeEntity });
    const updates = await this.updateRepo.findBy({ entity: safeEntity });
    const deletes = await this.deleteRepo.findBy({ entity: safeEntity });
    const queries = await this.queryRepo.findBy({ entity: safeEntity });

    return this.normalizeEvents(creates, updates, deletes, queries);
  }

  async getStats(): Promise<object> {
    const createCount = await this.createRepo.count();
    const updateCount = await this.updateRepo.count();
    const deleteCount = await this.deleteRepo.count();
    const queryCount = await this.queryRepo.count();

    return {
      create: createCount,
      update: updateCount,
      delete: deleteCount,
      query: queryCount,
      total: createCount + updateCount + deleteCount + queryCount,
    };
  }

  private validatePayloadForAction(dto: CreateEventDto, action: string): void {
    if (
      action !== 'QUERY' &&
      (!dto.payload || Object.keys(dto.payload).length === 0)
    ) {
      throw new BadRequestException(
        'payload es obligatorio para CREATE, UPDATE y DELETE.',
      );
    }
  }

  // Métodos privados
  // Función privada para normalizar eventos de diferentes tablas en un formato común para ordenarlos por fecha
  private normalizeEvents(
    creates: CreateEventEntity[],
    updates: UpdateEventEntity[],
    deletes: DeleteEventEntity[],
    queries: QueryEventEntity[],
  ): StoredEvent[] {
    const merged: StoredEvent[] = [
      ...creates.map((e) => ({
        ...e,
        _table: 'create_events',
        _eventDate: e.recorded_at,
      })),
      ...updates.map((e) => ({
        ...e,
        _table: 'update_events',
        _eventDate: e.timestamp,
      })),
      ...deletes.map((e) => ({
        ...e,
        _table: 'delete_events',
        _eventDate: e.createdAt,
      })),
      ...queries.map((e) => ({
        ...e,
        _table: 'query_events',
        _eventDate: e.event_date,
      })),
    ];

    return merged.sort((a, b) => {
      const ta = Date.parse(String(a._eventDate ?? '')) || 0;
      const tb = Date.parse(String(b._eventDate ?? '')) || 0;
      return tb - ta;
    });
  }

  // private clean(value: unknown): string {
  //   return String(value ?? '').trim();
  // }
  private clean(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }

    return '';
  }

  private extractQueryTerm(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const data = payload as Record<string, unknown>;
    return this.clean(
      data.query ?? data.filtro ?? data.id ?? data.name ?? '',
    ).substring(0, 120);
  }
}
