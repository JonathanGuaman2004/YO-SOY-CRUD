# Estrategia de ramas

El proyecto utilizará ramas por característica para evitar cambios directos sobre main.

## Ramas principales

- main: rama estable para releases.
- develop: rama de integración incremental.
- feature/*: nuevas funcionalidades o configuración.
- bugfix/*: correcciones.
- docs/*: documentación.
- refactor/*: mejoras internas o deuda técnica.

## Flujo

feature/* → Pull Request → develop → Pull Request → main → Release

## Regla

No se permite hacer push directo a main. Todo cambio debe pasar por Pull Request y revisión.