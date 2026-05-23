import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function originPatternToRegExp(pattern: string): RegExp | string {
  const cleanPattern = pattern.trim();

  if (!cleanPattern.includes('-')) {
    return cleanPattern;
  }

  const match = cleanPattern.match(
    /^(https?:\/\/(?:localhost|127\.0\.0\.1)):(\d+)-(\d+)$/,
  );

  if (!match) {
    return cleanPattern;
  }

  const protocolAndHost = match[1];
  const startPort = Number(match[2]);
  const endPort = Number(match[3]);

  if (
    !Number.isInteger(startPort) ||
    !Number.isInteger(endPort) ||
    startPort > endPort
  ) {
    return cleanPattern;
  }

  const escapedHost = escapeRegExp(protocolAndHost);

  return new RegExp(
    `^${escapedHost}:(?:${buildPortRangeRegex(startPort, endPort)})$`,
  );
}

function buildPortRangeRegex(startPort: number, endPort: number): string {
  const ports: string[] = [];

  for (let port = startPort; port <= endPort; port++) {
    ports.push(String(port));
  }

  return ports.join('|');
}

function parseCorsOrigins(value?: string): Array<string | RegExp> {
  const defaultOrigins = [
    'http://localhost:4000-4099',
    'http://127.0.0.1:4000-4099',
  ];

  const origins =
    value && value.trim().length > 0 ? value.split(',') : defaultOrigins;

  return origins
    .map((origin) => originPatternToRegExp(origin))
    .filter((origin) => {
      if (typeof origin === 'string') {
        return origin.trim().length > 0;
      }

      return true;
    });
}

function describeCorsOrigins(origins: Array<string | RegExp>): string {
  return origins.map((origin) => origin.toString()).join(', ');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const corsOrigins = parseCorsOrigins(
    configService.get<string>('CORS_ORIGINS'),
  );

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get<number>('PORT') ?? 3000;

  await app.listen(port);

  console.log(`EPN Event Manager corriendo en http://localhost:${port}`);
  console.log(`CORS habilitado para: ${describeCorsOrigins(corsOrigins)}`);
}

void bootstrap();
