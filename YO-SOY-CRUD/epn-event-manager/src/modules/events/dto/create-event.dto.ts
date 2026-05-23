import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Transform(({ value }) => String(value ?? '').trim())
  source!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Transform(({ value }) => String(value ?? '').trim())
  entity!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['CREATE', 'UPDATE', 'DELETE', 'QUERY'])
  @Transform(({ value }) =>
    String(value ?? '')
      .trim()
      .toUpperCase(),
  )
  action!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Transform(({ value }) => String(value ?? '').trim())
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => String(value ?? '').trim())
  description?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

//Modificado para:
/**  
 * Ya no acepta acciones inválidas.
- Ya no acepta campos obligatorios vacíos.
- Ya no acepta campos extra que no pertenecen al DTO.
- Se controla la longitud de source, entity, title y description.
- Se aprovechan correctamente class-validator y class-transformer.
 * */
