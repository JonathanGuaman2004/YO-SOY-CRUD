# Pipeline CI

El pipeline de Integración Continua automatiza las verificaciones principales del monorepo.

## Eventos escuchados

- pull_request hacia develop.
- pull_request hacia main.
- push hacia develop.
- push hacia main.
- workflow_dispatch para ejecución manual.

## Verificaciones

- Instalación de dependencias.
- Check o compilación.
- Linting.
- Build cuando aplica.
- Pruebas unitarias.
- Pruebas de integración.
- Coverage cuando aplica.

## Objetivo

Evitar que código con errores llegue a las ramas principales.