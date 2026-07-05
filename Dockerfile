# --- Stage 1: Build frontend ---
FROM node:22-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm install
COPY web/ .
RUN npm run build

# --- Stage 2: Build Go backend ---
FROM golang:1.25-alpine AS backend
WORKDIR /app/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ .
RUN CGO_ENABLED=0 go build -o sandershome ./cmd/sandershome/

# --- Stage 3: Runtime ---
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend /app/server/sandershome .
COPY --from=frontend /app/web/dist ./web/dist

ENV PORT=8080 \
    DATABASE_PATH=/data/sandershome.db \
    STATIC_DIR=/app/web/dist \
    TZ=UTC

EXPOSE 8080
VOLUME ["/data"]

CMD ["./sandershome"]
