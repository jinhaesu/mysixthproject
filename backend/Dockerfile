FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Production ---
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/uploads

ENV NODE_ENV=production
EXPOSE 4000

# PROCESS_TYPE=worker 면 worker.js, 아니면 index.js (default web)
# Railway 의 Start Command 설정에 의존하지 않고 환경변수로 분기.
CMD if [ "$PROCESS_TYPE" = "worker" ]; then node dist/worker.js; else node dist/index.js; fi
