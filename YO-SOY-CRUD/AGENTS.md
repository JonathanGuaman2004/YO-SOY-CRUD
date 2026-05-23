# YO-SOY-CRUD

Multi-project workspace con 5 proyectos.

## Proyectos

| Proyecto | Puerto | Framework | Notas |
|----------|--------|-----------|-------|
| `epn-event-manager/` | **3000** | NestJS + TypeORM + SQLite | Event Hub central |
| `missions-crud/` | **4000** | Express + node:sqlite | Misiones espaciales |
| `esports-crud/` | **4001** | Express + node:sqlite | Torneos de eSports |
| `pets-crud/` | **4002** | Express + node:sqlite | Gestión de mascotas |
| `audiohub-frontend/` | — | HTML/JS estático | Sin package.json |

## Orden de ejecución

1. Primero: `epn-event-manager` (puerto 3000)
2. Luego: cualquiera de los CRUDs (4000-4002)

## Comandos por Proyecto

### epn-event-manager
```bash
cd epn-event-manager
pnpm install
pnpm run build
pnpm run lint
pnpm test
pnpm run start:dev
```

### missions-crud / esports-crud / pets-crud
```bash
cd <proyecto>
pnpm install
pnpm run check
pnpm run lint
pnpm test
pnpm start
```

## Integración

- Todos los CRUDs envían eventos a `epn-event-manager` via `POST /events`
- Todos usan el módulo nativo `node:sqlite` (requiere Node.js 22.5.0+)

## Calidad

Para proyectos con check + lint + test:
```bash
pnpm run check && pnpm run lint && pnpm test
```

## Notas

- Para exportar en zip sin que pese: eliminar `node_modules/` y `pnpm-lock.yaml` de cada proyecto
- Los receptores deberán ejecutar `pnpm install` en cada carpeta