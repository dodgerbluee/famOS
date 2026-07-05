# SandersHome

Family dashboard for the Sanders household. Calendar, weather, cameras (Frigate), AI briefing, and Sanders Cash rewards — all on one screen, designed for a wall-mounted touchscreen.

## Quick Start (Docker)

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

Everything is configurable from the **Settings** page in the app — no env vars required to get started.

## Quick Start (Local Dev)

Prerequisites: Go 1.23+, Node 22+

**1. Start the API server:**

```bash
cd server
go build -o sandershome ./cmd/sandershome/
DATABASE_PATH=../data/sandershome.db \
  PORT=8080 \
  SESSION_SECRET=dev-secret \
  FRONTEND_URL=http://localhost:5173 \
  AI_PROVIDER=ollama \
  OLLAMA_URL=http://localhost:11434 \
  OLLAMA_MODEL=llama3.1 \
  ./sandershome
```

**2. Start the frontend dev server (separate terminal):**

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` and `/ws` to the Go backend on port 8080.

## Configuration

Most settings are managed in-app via **Settings**:

| Setting | Where to configure |
|---|---|
| Weather location (lat/lon) | Settings > Integrations > Weather Location |
| Frigate camera URL + credentials | Settings > Integrations > Frigate Cameras |
| CalDAV calendar sources | Settings > Calendar Sources |
| AI briefing provider (Ollama) | Settings > Integrations > AI Briefing |
| Family members | Settings > Family Members |
| MQTT broker (motion alerts) | Settings > Integrations > MQTT |

### Environment Variables

These can also be set as env vars (useful for Docker). In-app settings override env vars.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `sandershome.db` | Path to SQLite database |
| `PORT` | `8080` | API server port |
| `SESSION_SECRET` | (required) | Secret for session cookies |
| `FRONTEND_URL` | `http://localhost:3000` | CORS origin for the frontend |
| `AI_PROVIDER` | `ollama` | AI provider (`ollama`) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.1` | Ollama model name |
| `LOCATION_LAT` | `0` | Default latitude |
| `LOCATION_LON` | `0` | Default longitude |
| `FRIGATE_URL` | | Frigate NVR URL |
| `TZ` | `UTC` | App display timezone (IANA name like `America/New_York`) |
| `MQTT_BROKER` | | Legacy MQTT broker URL (`tcp://host:1883`) |
| `MQTT_HOST` | | MQTT host |
| `MQTT_PORT` | `1883` | MQTT port |
| `MQTT_USERNAME` | | MQTT username |
| `MQTT_PASSWORD` | | MQTT password |
| `MQTT_DISCOVERY_PREFIX` | `homeassistant` | MQTT discovery prefix |
| `MQTT_BASE_TOPIC` | `frigate` | MQTT topic prefix; motion alerts subscribe to `<base>/events` |
| `MQTT_CLIENT_ID` | `sandershome` | MQTT client ID |

## Project Structure

```
server/          Go backend (chi router, SQLite, WebSocket)
  cmd/sandershome/   Entrypoint
  internal/          Business logic (api, service, caldav, frigate, ai)
web/             React frontend (Vite, TypeScript, Tailwind)
  src/components/    UI components
  src/pages/         Route pages
data/            SQLite database (created on first run)
docker-compose.yml
```

## Production (Docker Compose)

```bash
# Set a real session secret
export SESSION_SECRET=$(openssl rand -hex 32)

docker compose up -d --build
```

The web container serves the built frontend on port 3000 via nginx, which proxies API requests to the Go backend on port 8080. Data persists in the `./data` volume.
