# ai-bulk · Python Backend

A 100 % Python rewrite of the original Node.js + TypeScript + Express image-generation
backend. Same feature set, same public API contract (so the existing Electron + React
frontend keeps working unchanged), rebuilt on **Python 3.11 · FastAPI · asyncio**.

- **Bulk image generation** — upload 1–1000+ images, queued and processed concurrently.
- **Async worker-pool queue** — replaces the Node `ImageQueueService` (`EventEmitter` +
  `setInterval`) with an event-driven `asyncio` worker pool, concurrency control,
  exponential-backoff retries, and full job-state tracking.
- **Real-time updates** — Server-Sent Events at `GET /api/events` **and** a WebSocket at
  `GET /api/ws`, both fed by an in-process `EventBus`.
- **Virtual Try-On** — `POST /api/vto` using the **Python Vertex AI SDK** (`virtual-try-on-001`),
  no REST calls.
- **Settings** — JSON-file persistence with hot environment-variable injection and
  provider switching (Gemini · Vertex · Dust).

---

## ⚠️ Security notice — read first

The **original `ai-bulk.tar` you provided contained a real-looking `GEMINI_API_KEY`** in its
`.env` file (value beginning `AQ.Ab8RN6…`). Treat that key as **compromised and rotate it
immediately** in Google AI Studio / Cloud Console — anything committed to a tarball or repo
should be considered leaked. This Python project ships only with placeholder values in
`.env.example`; no real secret is included. Never commit a populated `.env`.

---

## Requirements

- Python 3.11+
- For Vertex AI (Imagen 3 + Virtual Try-On): a GCP project with Vertex AI enabled and
  Application Default Credentials configured:
  ```bash
  gcloud auth application-default login
  ```

## Setup

```bash
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                 # then fill in your own keys
cp settings.example.json settings.json
```

## Run

```bash
uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

The server listens on **:3001** (same port as the Node original), serves generated images
as static files under **`/output`**, and allows CORS from `http://localhost:5173` and
`http://localhost:3001` by default. The React frontend's `API_BASE_URL` of
`http://localhost:3001/api` works without modification.

Interactive API docs: <http://localhost:3001/docs>

## Docker

```bash
docker compose up --build
```

`docker-compose.yml` runs the API service, mounts `./output` and `./logs`, mounts your
local ADC for Vertex auth, and includes an optional (commented) Redis service and a
separate worker container for horizontal scaling.

## Smoke test

`smoke_test.py` drives the real container, queue, and event pipeline with a fake provider
(no Google SDK or network needed) and asserts the bulk + retry + event flow:

```bash
python smoke_test.py
```

---

## API contract

> The original frontend calls `/api/images/*`, `/api/queue/*`, `/api/settings/*`, etc.
> Those exact paths are preserved here. The migration spec listed simpler aliases
> (`/api/upload`, `/api/gallery`, `/api/job/{id}`); preserving the real frontend contract
> was chosen over the spec aliases so the existing React app keeps working untouched.
> See `MIGRATION.md` for the full path-by-path mapping.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/images/upload` | Multipart upload (`files` + `prompt`); enqueues jobs |
| GET | `/api/images` | Gallery list (`status`, `search`, `sortBy`, `sortOrder`, `limit`, `offset`) |
| DELETE | `/api/images/{id}` | Delete a job + its output file |
| POST | `/api/images/{id}/retry` | Re-queue a failed job |
| POST | `/api/images/{id}/cancel` | Cancel a pending/processing job |
| GET | `/api/queue/stats` | Queue counters + progress |
| POST | `/api/queue/start\|pause\|resume\|stop\|cancel` | Queue control |
| GET | `/api/settings` | Read settings (secrets masked) |
| PUT | `/api/settings` | Update settings (masked values are not overwritten) |
| POST | `/api/settings/validate-key` | Validate a provider API key |
| POST | `/api/settings/select-folder` / `open-folder` | Output-folder helpers |
| POST | `/api/vto` | Virtual Try-On (person + product image → generated image) |
| GET | `/api/events` | SSE stream |
| GET | `/api/ws` | WebSocket stream |
| GET | `/api/health` | Health check |
| GET | `/output/...` | Static generated images |

All JSON responses use the envelope `{ "success": true, "data": ... }` or
`{ "success": true, "message": ... }`; errors use
`{ "success": false, "error": { "code", "message" } }`.

## Project layout

```
app/
  core/            config · errors · logging · events (EventBus)
  domain/          entities (ImageJob, Settings) · interfaces (Protocols)
  application/     dto · services/queue_service.py (async worker pool) · use_cases
  infrastructure/  providers (gemini, vertex imagen, vertex VTO, dust) ·
                   repositories · config (json settings) · filesystem
  presentation/    container (DI) · routers · schemas · middleware
  main.py          create_app() + lifespan + uvicorn entrypoint
```
