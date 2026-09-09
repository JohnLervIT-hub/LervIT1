FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/shared ./shared

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "node scripts/startup-migrate.js && node dist/index.js"]
