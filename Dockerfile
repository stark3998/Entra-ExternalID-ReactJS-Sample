FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    APP_PORT=8080 \
    CORS_PORT=3001 \
    LOCAL_API_PATH=/api

EXPOSE 8080 3001

CMD ["node", "scripts/start-stack.js", "--plain"]
