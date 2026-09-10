FROM node:20-slim AS builder

WORKDIR /app

ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_GOOGLE_MAPS_ID
ARG VITE_STRIPE_PUBLIC_KEY
ARG VITE_ENABLE_ENTERPRISE

ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_MAPS_ID=$VITE_GOOGLE_MAPS_ID
ENV VITE_STRIPE_PUBLIC_KEY=$VITE_STRIPE_PUBLIC_KEY
ENV VITE_ENABLE_ENTERPRISE=$VITE_ENABLE_ENTERPRISE

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
# scripts/startup-migrate.js reads migrations/0010_agent_foundation.sql at
# boot — the runtime image needs the whole migrations tree available.
COPY --from=builder /app/migrations ./migrations

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "node scripts/startup-migrate.js && node dist/index.js"]
