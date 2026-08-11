# build context = repo root (ดู docker-compose.yml) เพราะ bun.lock อยู่ที่ root ของ workspace

# ---- Build stage ----
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN bun install --frozen-lockfile

COPY frontend/ ./frontend/
RUN bun run --cwd frontend build

# ---- Production — nginx serves static files ----
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
