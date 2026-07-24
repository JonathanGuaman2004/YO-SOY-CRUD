export type EventPayload = Record<string, unknown>;

export interface EventResponseDto {
  id: number;
  source: string;
  entity: string;
  action: string;
  title: string;
  description: string;
  payload: EventPayload;
  occurredAt: string;
}
