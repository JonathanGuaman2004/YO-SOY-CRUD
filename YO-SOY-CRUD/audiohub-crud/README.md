# AudioHub — Gestión de Canciones y Podcasts

Este módulo permite gestionar una biblioteca de audios (canciones y podcasts) mediante operaciones CRUD:

- Crear audios
- Listar audios
- Consultar un audio por ID
- Actualizar datos de un audio
- Eliminar audios
- Ver estadísticas básicas

Además, se conecta con `epn-event-manager` para enviar eventos cuando se realiza una acción.

## Tecnologías usadas

- Node.js
- Express
- SQLite (`node:sqlite` nativo)
- HTML, CSS y JavaScript
- Axios
- ESLint
- node:test

## Ejecución

Instalar dependencias:

```bash
npm install
npm start
```

Abrir el navegador en:

```
http://localhost:4003
```

## Scripts disponibles

```bash
npm start        # Inicia el servidor
npm run dev      # Inicia con hot-reload (node --watch)
npm test         # Corre los tests de validación
npm run lint     # Corre el linter
npm run check    # lint + test
```

## Endpoints

| Método | Ruta            | Descripción                     |
|--------|-----------------|---------------------------------|
| GET    | /audios         | Lista todos los audios          |
| GET    | /audios/:id     | Obtiene un audio por ID         |
| POST   | /audios         | Crea un nuevo audio             |
| PUT    | /audios/:id     | Actualiza un audio              |
| DELETE | /audios/:id     | Elimina un audio                |
| GET    | /audios/stats   | Estadísticas de la biblioteca   |
| GET    | /audios/types   | Tipos permitidos                |
| GET    | /health         | Estado del servicio y del hub   |

## Tipos permitidos

- `cancion`
- `podcast`

## Requisitos

- Node.js 22+
- `epn-event-manager` corriendo en `http://localhost:3000`
