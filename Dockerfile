# ── build du front : node n'existe que dans cette étape ──────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

# ── runtime : un seul process, Python stdlib, zéro dépendance ────────────────
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*
ENV TZ=Europe/Paris \
    PORT=80 \
    PUBLIC_DIR=/app/public \
    DATA_DIR=/app/data \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend ./backend
COPY --from=build /app/dist ./public
EXPOSE 80
CMD ["python", "backend/server.py"]
