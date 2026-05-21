FROM node:20-alpine

# Directorio de trabajo en el contenedor
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el resto del código
COPY . .

# Exponer el puerto de la aplicación Node (el código lo corre en el 3000)
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "server.js"]
