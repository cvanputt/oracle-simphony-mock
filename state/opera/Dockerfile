FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 5000
ENV NODE_ENV=development
CMD ["node", "server.js"]
