# Arquitectura del monorepo YO-SOY-CRUD

YO-SOY-CRUD es un monorepo compuesto por varios módulos independientes que se integran mediante eventos.

## Módulos

- epn-event-manager: servicio central de eventos desarrollado con NestJS.
- missions-crud: CRUD de misiones espaciales con Express.
- esports-crud: CRUD de torneos de eSports con Express.
- pets-crud: CRUD de mascotas con Express.
- audiohub-frontend: frontend estático.

## Integración

Los CRUDs envían eventos al módulo epn-event-manager mediante solicitudes HTTP. De esta forma, el Event Manager funciona como núcleo central para registrar eventos generados por los módulos CRUD.

## Arquitectura lógica

CRUDs REST → HTTP POST /events → EPN Event Manager → SQLite

## Regla arquitectónica

Los controladores deben recibir solicitudes y delegar la lógica. La lógica de negocio debe mantenerse separada de la infraestructura, configuración, logs y acceso a datos.