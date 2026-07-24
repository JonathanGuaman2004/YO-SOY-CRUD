import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import type { EventResponseDto } from './dto/event-response.dto';

type PersistedEvent =
  | CreateEventEntity
  | UpdateEventEntity
  | DeleteEventEntity
  | QueryEventEntity;

type EventQuery = Record<string, string | undefined>;

type PaginatedEventsResponse = {
  data: EventResponseDto[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    returned: number;
    hasNextPage: boolean;
  };
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

  // Evita repetición de código para obtener eventos de las 4 tablas,
  // normalizarlos, filtrarlos y paginarlos.
  async findAll(query: EventQuery = {}): Promise<PaginatedEventsResponse> {
    const creates = await this.createRepo.find();
    const updates = await this.updateRepo.find();
    const deletes = await this.deleteRepo.find();
    const queries = await this.queryRepo.find();

    const events = this.normalizeEvents(creates, updates, deletes, queries);
    const filteredEvents = this.filterEvents(events, query);

    return this.paginateEvents(filteredEvents, query);
  }

  async findBySource(source: string): Promise<EventResponseDto[]> {
    const safeSource = this.clean(source);
    if (!safeSource) throw new BadRequestException('source inválido');

    const creates = await this.createRepo.findBy({ source: safeSource });
    const updates = await this.updateRepo.findBy({ source: safeSource });
    const deletes = await this.deleteRepo.findBy({ source: safeSource });
    const queries = await this.queryRepo.findBy({ source: safeSource });

    return this.normalizeEvents(creates, updates, deletes, queries);
  }

  //
  async findByEntity(entity: string): Promise<EventResponseDto[]> {
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

  private filterEvents(
    events: EventResponseDto[],
    query: EventQuery,
  ): EventResponseDto[] {
    const source = this.clean(query.source);
    const entity = this.clean(query.entity);
    const action = this.clean(query.action).toUpperCase();
    const from = this.clean(query.from);
    const to = this.clean(query.to);

    return events.filter((event) => {
      if (source && event.source !== source) return false;
      if (entity && event.entity !== entity) return false;

      if (action && event.action.toUpperCase() !== action) {
        return false;
      }

      const eventTime = Date.parse(event.occurredAt) || 0;

      if (from) {
        const fromTime = Date.parse(`${from}T00:00:00.000Z`);
        if (!Number.isNaN(fromTime) && eventTime < fromTime) {
          return false;
        }
      }

      if (to) {
        const toTime = Date.parse(`${to}T23:59:59.999Z`);
        if (!Number.isNaN(toTime) && eventTime > toTime) {
          return false;
        }
      }

      return true;
    });
  }

  private paginateEvents(
    events: EventResponseDto[],
    query: EventQuery,
  ): PaginatedEventsResponse {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const data = events.slice(offset, offset + limit);

    return {
      data,
      pagination: {
        total: events.length,
        limit,
        offset,
        returned: data.length,
        hasNextPage: offset + limit < events.length,
      },
    };
  }
  // Métodos privados
  // Función privada para normalizar eventos de diferentes tablas en un formato común para ordenarlos por fecha
  private normalizeEvents(
    creates: CreateEventEntity[],
    updates: UpdateEventEntity[],
    deletes: DeleteEventEntity[],
    queries: QueryEventEntity[],
  ): EventResponseDto[] {
    const merged: EventResponseDto[] = [
      ...creates.map((event) => this.toEventResponse(event, event.recorded_at)),
      ...updates.map((event) => this.toEventResponse(event, event.timestamp)),
      ...deletes.map((event) => this.toEventResponse(event, event.createdAt)),
      ...queries.map((event) => this.toEventResponse(event, event.event_date)),
    ];

    return merged.sort(
      (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
    );
  }

  private toEventResponse(
    event: PersistedEvent,
    dateValue: unknown,
  ): EventResponseDto {
    return {
      id: Number(event.id),
      source: this.clean(event.source),
      entity: this.clean(event.entity),
      action: this.clean(event.action).toUpperCase(),
      title: this.clean(event.title),
      description: this.clean(event.description),
      payload: this.parsePayload(event.payload),
      occurredAt: this.normalizeDate(dateValue),
    };
  }

  private parsePayload(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    if (typeof value !== 'string' || !value.trim()) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(value);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }

      return {};
    } catch {
      return {};
    }
  }

  private normalizeDate(value: unknown): string {
    const timestamp = Date.parse(this.clean(value));

    if (Number.isNaN(timestamp)) {
      return new Date(0).toISOString();
    }

    return new Date(timestamp).toISOString();
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
