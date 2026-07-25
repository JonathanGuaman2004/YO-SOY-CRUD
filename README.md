# YO-SOY-CRUD

Sistema CRUD diseñado para la gestión de entidades de manera eficiente, aplicando buenas prácticas de desarrollo de software, integración continua y despliegue automatizado.

---

## 📌 Descripción

**YO-SOY-CRUD** es un proyecto orientado a la implementación de operaciones CRUD (Crear, Leer, Actualizar y Eliminar), con un enfoque en calidad de software, automatización de pruebas y uso de pipelines CI/CD.

Este proyecto busca demostrar una arquitectura clara, mantenible y escalable, integrando herramientas modernas para asegurar la calidad del código y facilitar el trabajo colaborativo.

---

## 🚀 Objetivos

* Implementar un sistema CRUD funcional y estructurado
* Aplicar desarrollo iterativo e incremental
* Integrar pruebas automatizadas (unitarias e integración)
* Automatizar procesos mediante pipelines (CI/CD)
* Garantizar calidad de código mediante linting y formateo
* Facilitar el trabajo en equipo usando Git y GitHub

---

## 🛠️ Tecnologías (Referenciales)

Este proyecto puede incluir tecnologías como:

* Lenguaje: Java / JavaScript / otros
* Framework: Spring Boot / Node.js / otros
* Base de datos: MySQL / PostgreSQL
* Control de versiones: Git
* Automatización: GitHub Actions

---

## ⚙️ Instalación y ejecución

### 1. Clonar el repositorio

```bash
git clone https://github.com/JonathanGuaman2004/YO-SOY-CRUD.git
cd YO-SOY-CRUD
```

### 2. Configurar variables de entorno

Configurar credenciales de base de datos y variables necesarias según el entorno.

### 3. Ejecutar el proyecto

```bash
# Ejemplo con Java (Spring Boot)
./mvnw spring-boot:run

# Ejemplo con Node.js
npm install
npm run dev
```

---

## 🧪 Testing y calidad

El proyecto incorpora procesos automáticos para asegurar la calidad:

* ✔️ Compilación del proyecto
* ✔️ Pruebas unitarias (PU)
* ✔️ Pruebas de integración (PI)
* ✔️ Linting y formateo de código

Estos procesos se ejecutan automáticamente mediante pipelines.

---

## 🔄 CI/CD (Integración y Despliegue Continuo)

Se utilizan pipelines para automatizar:

* Ejecución de pruebas
* Validación de calidad del código
* Verificación en Pull Requests
* Control de integridad en ramas principales

### 📌 Eventos que activan pipelines

* `push`
* `pull_request`
* `merge`

### 📌 Ramas monitoreadas

* `main`
* `develop`

---

## 🌿 Flujo de trabajo (Git)

El equipo trabaja bajo un flujo basado en ramas:

* `main` → versión estable
* `develop` → integración continua
* `feature/*` → desarrollo de funcionalidades

### Proceso:

1. Crear una rama desde `develop`
2. Desarrollar la funcionalidad
3. Subir cambios (`push`)
4. Crear Pull Request
5. Validación automática (CI)
6. Revisión y merge

---

## 📦 Versionamiento

El proyecto utiliza versionamiento basado en releases:

* `v1.0.0` → versión inicial estable
* `v1.1.0` → nuevas funcionalidades
* `v1.1.1` → correcciones

Se pueden generar versiones desde GitHub mediante tags o releases.

---

## 📚 Documentación

Toda la documentación detallada del proyecto se encuentra en la carpeta `/docs`.

### 🔗 Accesos rápidos

* 📄 [Arquitectura del sistema](docs/04-arquitectura.md)
* 📄 [Metodología de desarrollo](docs/01-enfoque-iterativo-incremental.md)
* 📄 [Definition Of Ready](docs/02-definition-of-ready.md)
* 📄 [Definition Of Done](docs/03-definition-of-done.md)
* 📄 [Testing y calidad](docs/testing.md)
* 📄 [CI y pipelines](docs/07-pipeline-ci.md)
* 📄 [Contribución](docs/contribucion.md)
* 📄 [Releases Versionamiento](docs/08-releases-versionamiento.md)

---

## 👥 Equipo de desarrollo

Proyecto desarrollado por un equipo de trabajo colaborativo, aplicando prácticas de desarrollo modernas, integración continua y metodologías ágiles.

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Para colaborar:

1. Crear una rama:

   ```bash
   git checkout -b feature/nueva-funcionalidad
   ```

2. Realizar cambios y hacer commit:

   ```bash
   git commit -m "feat: nueva funcionalidad"
   ```

3. Subir cambios:

   ```bash
   git push origin feature/nueva-funcionalidad
   ```

4. Crear un Pull Request en GitHub

---

## 📄 Licencia

Este proyecto está destinado para fines académicos y educativos.

---
