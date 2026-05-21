# LabelPro Business Order Management

Aplicación web de gestión de pedidos para un negocio de etiquetas. Desarrollada con **Node.js (Express)**, **PostgreSQL**, **EJS**, y **Tailwind CSS**. Incluye un Tablero Kanban interactivo usando **SortableJS**.

## Características

- **Dashboard Kanban**: Gestión visual del flujo de trabajo (Pendiente -> Imprimiendo -> Cortando -> Terminado -> Entregado -> Pagado) con Drag & Drop.
- **Roles de Usuario**: 
  - **Operadores**: Pueden crear pedidos, ver el Kanban y mover tarjetas hasta "Terminado". No tienen acceso a finanzas o configuración.
  - **Administrador**: Control total sobre catálogo, etiquetas, finanzas y control de roles de usuario.
- **Gestión de Catálogo**: CRUD de Productos, Calidades e Impresoras.
- **Gestión de Etiquetas**: Definición de dimensiones, precios, y archivos adjuntos (Imagen, PDF, Word).
- **Finanzas**: Resumen de ingresos por cobrar (entregados) y pagados, además del cálculo de mano de obra.

## Requisitos Previos

- [Docker](https://www.docker.com/) y [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) (v14 o superior)

## Instalación y Despliegue

1. **Clonar/Descargar el repositorio** e ir a la carpeta del proyecto.
   \`\`\`bash
   cd label-app
   \`\`\`

2. **Levantar la Base de Datos con Docker Compose**
   Esto descargará la imagen de PostgreSQL 15, creará la base de datos \`label_db\` y ejecutará el script inicial \`database/init.sql\` creando todas las tablas y el usuario administrador por defecto.
   \`\`\`bash
   docker-compose up -d
   \`\`\`

3. **Instalar Dependencias de Node.js**
   \`\`\`bash
   npm install
   \`\`\`

4. **Configurar Variables de Entorno**
   Verifica que el archivo \`.env\` tenga la configuración correcta. Por defecto es:
   \`\`\`env
   PORT=3000
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_NAME=label_db
   SESSION_SECRET=super_secret_session_key_123
   \`\`\`

5. **Iniciar el Servidor**
   \`\`\`bash
   # Modo desarrollo (con nodemon)
   npm run dev
   
   # Modo producción
   npm start
   \`\`\`

6. **Acceso al Sistema**
   Abre tu navegador en [http://localhost:3000](http://localhost:3000)

   **Credenciales por defecto del Administrador:**
   - **Usuario**: \`admin\`
   - **Contraseña**: \`admin\`

## Estructura del Proyecto

- \`server.js\`: Punto de entrada de la aplicación Express.
- \`db.js\`: Configuración del pool de conexión a PostgreSQL.
- \`routes/\`: Rutas de la aplicación (auth, orders, api, admin).
- \`views/\`: Plantillas EJS para el frontend.
- \`public/\`: Archivos estáticos (CSS, JS) y carpeta \`uploads/\` para los archivos de las etiquetas.
- \`database/init.sql\`: Script de inicialización de PostgreSQL.
- \`docker-compose.yml\`: Configuración del contenedor de PostgreSQL.
