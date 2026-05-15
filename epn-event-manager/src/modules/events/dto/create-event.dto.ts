export class CreateEventDto {
  source: string;
  entity: string;
  action: string;
  title: string;
  description?: string;
  payload?: Record<string, unknown>;
}
