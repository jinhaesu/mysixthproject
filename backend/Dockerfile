FROM node:20-bookworm-slim AS builder

# better-sqlite3 네이티브 빌드에 필요한 도구
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Production ---
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data /app/uploads

# 영구 볼륨 선언 - 컨테이너 재빌드 시에도 데이터 유지
VOLUME ["/app/data", "/app/uploads"]

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
