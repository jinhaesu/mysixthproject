FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p uploads data

EXPOSE 4000

CMD ["node", "dist/index.js"]
