# ── Stage 1: Build ─────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY proto ./proto

RUN npm run build

# ── Stage 2: Production runtime ────────────────────────────
FROM node:22-alpine AS runtime

# ffmpeg required for RTSP snapshot capture
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and gRPC proto files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/proto ./proto

# Snapshot storage volume mount point
RUN mkdir -p /app/storage

EXPOSE 8080

# Default: run the main API server
# Override CMD in docker-compose for workers
CMD ["node", "dist/server.js"]

