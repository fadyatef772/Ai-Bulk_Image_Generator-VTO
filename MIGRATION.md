# Migration Reference — Node.js/TypeScript → Python

This document covers the three migration deliverables: the **Node → Python mapping table**,
the **architecture diagram**, and the **migration strategy**.

---

## 1. Node → Python mapping table

### Runtime & framework

| Node.js / TypeScript | Python equivalent | Notes |
|----------------------|-------------------|-------|
| Express app (`server.ts`) | **FastAPI** app (`app/main.py`) | `create_app()` + lifespan |
| Express `Router` / controllers | **FastAPI `APIRouter`** (`presentation/routers/*`) | one router per resource |
| `http.Server` + `app.listen(3001)` | **Uvicorn** ASGI server, port 3001 | `uvicorn app.main:app` |
| Zod schemas | **Pydantic v2** models (`schemas.py`, `dto.py`) | validation + serialization |
| Multer (multipart) | **`UploadFile`** / `python-multipart` | `/api/images/upload` |
| Winston logger | **`core/logging.py`** | JSON rotating files + pretty console |
| `dotenv` + `process.env` | **pydantic-settings** `AppConfig` (`core/config.py`) | typed env loading |
| `EventEmitter` | **`EventBus`** (`core/events.py`) | `on` / `emit` + async fan-out |
| TypeScript `interface` | **`typing.Protocol`** (`domain/interfaces.py`) | structural typing, DI seams |

### Queue system (the critical rewrite)

| Node `ImageQueueService` | Python `ImageQueueService` (`application/services/queue_service.py`) |
|--------------------------|---------------------------------------------------------------------|
| `extends EventEmitter` | composes an injected `EventBus` |
| `setInterval(tick, 500)` poll loop | **N long-lived worker coroutines** woken by an `asyncio.Event` (no polling) |
| `activeWorkers` vs `concurrentWorkers` | same counters, claim guarded by an `asyncio.Lock` |
| `processingJobIds: Set` | `_processing_job_ids: set` |
| fire-and-forget `processJob()` | `await`ed inside each worker loop; `asyncio.wait_for` timeout |
| fixed `retryDelayMs` + `setTimeout` | **exponential backoff** `retry_delay_ms * 2 ** (retry_count-1)` |
| safety-blocked jobs not retried | preserved (`"safety" in message` → no retry) |
| emits `job:started/completed/failed/cancelled/retrying`, `stats:updated`, `queue:complete`, `started/paused/resumed/stopped` | identical event names, via `EventBus` |
| in-process only | in-process default; `QUEUE_BACKEND=redis` flag reserved for scale-out |

### Real-time / events

| Node | Python |
|------|--------|
| SSE endpoint (`res.write('data: …')`) | **`GET /api/events`** via `StreamingResponse` (`routers/events.py`) |
| — (not in original) | **`GET /api/ws`** WebSocket, same event stream |
| `server.ts` maps `stats:updated`→`stats`, `started`→`queue:started` | `_EVENT_MAP` in `routers/events.py` reproduces this renaming so the frontend's listeners (`stats`, `job:completed`, `job:failed`, `queue:complete`, `queue:started`) are unchanged |
| 2-second stats heartbeat (`setInterval`) | `Container._heartbeat()` `asyncio.create_task` loop |

### Providers (all implement `IImageGenerationService`)

| Node service | Python module | Library |
|--------------|---------------|---------|
| `GeminiService` (`@google/generative-ai`) | `providers/gemini_service.py` | `google-generativeai`, calls wrapped in `asyncio.to_thread` |
| `VertexGeminiService` (**REST** `predict`) | `providers/vertex_imagen_service.py` | **Vertex AI SDK** `ImageGenerationModel.edit_image` — REST removed per spec |
| *(none — new build)* | `providers/vertex_vto_service.py` | Vertex AI Python SDK, model `virtual-try-on-001` |
| `DustService` | `providers/dust_service.py` | `httpx` async (conversation-create + poll + extract) |
| `ImageServiceFactory` | `providers/factory.py` | selects by `API_PROVIDER` |

### Persistence / IO

| Node | Python |
|------|--------|
| `InMemoryImageJobRepository` | `repositories/in_memory_job_repository.py` (`asyncio.Lock`-guarded dict) |
| `JsonSettingsRepository` (settings.json + env inject) | `config/json_settings_repository.py` (`aiofiles`, `sync_env` hot-inject) |
| `FileSystemService` (Generated/Failed/Logs/Temp) | `filesystem/filesystem_service.py` — same dir layout + `<name>_<ts>_<uuid8><ext>` scheme |

### Endpoint path mapping (spec aliases vs preserved frontend contract)

| Spec alias | Implemented path (frontend contract) |
|------------|--------------------------------------|
| `POST /api/upload` | `POST /api/images/upload` |
| `GET /api/gallery` | `GET /api/images` |
| `DELETE /api/job/{id}` | `DELETE /api/images/{id}` |
| `POST /api/job/{id}/retry` | `POST /api/images/{id}/retry` |
| `GET /api/queue/stats` | `GET /api/queue/stats` ✓ (same) |
| `GET /api/events` | `GET /api/events` ✓ (+ `GET /api/ws`) |
| `POST /api/vto` | `POST /api/vto` ✓ (same) |
| `GET/POST /api/settings` | `GET /api/settings` · `PUT /api/settings` (+ helpers) |

The real React frontend calls the right-hand paths, so those are authoritative; the spec
aliases are documented here for reference.

---

## 2. Architecture diagram (text)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                     Electron + React frontend (unchanged)                   │
│        fetch /api/* · EventSource /api/events · (optional) WS /api/ws       │
└───────────────┬─────────────────────────────────────────▲─────────────────┘
                │ HTTP (REST, multipart)                   │ SSE / WebSocket
                ▼                                          │ (real-time events)
┌───────────────────────────────────────────────────────────────────────────┐
│                          FastAPI app  (app/main.py)                         │
│  CORS · RequestLogger middleware · exception handlers · static /output      │
│                                                                             │
│  presentation/routers/                                                      │
│    images · queue · settings · vto · events · health                        │
│                         │  (depend on)                                      │
│                         ▼                                                    │
│  presentation/container.py  ── DI composition root (one per process) ──┐    │
│                                                                        │    │
│  application/                                                          │    │
│    use_cases (upload · gallery · delete · retry)                       │    │
│    services/ImageQueueService  ◄── asyncio worker pool ──┐             │    │
│                                                          │             │    │
│                          ┌──────── EventBus ◄────────────┘ emits       │    │
│                          │        (core/events.py)        events       │    │
│                          ▼                                             ▼    │
│              SSE / WS routers stream to frontend          domain/entities   │
│                                                           (ImageJob,Settings)│
│  infrastructure/                                                            │
│    repositories (in-memory jobs)   config (json settings + env inject)      │
│    filesystem (Generated/Failed/Logs/Temp)                                  │
│    providers ── factory ──► Gemini · Vertex Imagen · Vertex VTO · Dust       │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ asyncio.to_thread (non-blocking)
                                  ▼
                  ┌──────────────────────────────────┐
                  │   Google Vertex AI / Gemini /     │
                  │   Dust  (image gen + try-on)      │
                  └──────────────────────────────────┘

Flow:  Frontend → FastAPI → Queue → Workers → Vertex AI → Storage (/output)
                                  └──────────► EventBus → SSE/WS → Frontend
```

**Request lifecycle (bulk generation):**
1. Frontend `POST /api/images/upload` (multipart) → `UploadImagesUseCase` validates files,
   writes them to `Temp/`, and calls `queue.create_job()` per file.
2. `add_jobs()` persists jobs as `pending` and sets the wake `Event`.
3. Idle worker coroutines wake, claim a job under the lock (`processing`), read the input,
   call the active provider via `asyncio.to_thread`, save output to `Generated/`, mark
   `completed`.
4. On error: increment retry, and unless safety-blocked or retries exhausted, re-queue with
   exponential backoff; otherwise mark `failed` and write a `Failed/` record.
5. Every transition emits through the `EventBus`; SSE/WS routers stream `stats`,
   `job:completed`, `job:failed`, `queue:complete`, etc. to the frontend in real time.

---

## 3. Migration strategy (safe, zero-downtime)

**Phase 0 — Prep**
- Rotate the leaked `GEMINI_API_KEY` from the original tarball.
- Stand up the Python service in staging; point it at a throwaway output folder.
- Run `smoke_test.py` and the TestClient checks; confirm `/docs` and `/api/health`.

**Phase 1 — Shadow / bridge mode (both systems running)**
- Keep the Node backend on **:3001** serving the frontend.
- Run the Python backend on a **different port** (e.g. **:3002**).
- Because the Python service reproduces the exact `/api/*` contract, response envelopes, SSE
  event names, and `/output` static layout, the frontend can be pointed at either by
  changing only `API_BASE_URL`.
- Mirror a copy of real uploads to :3002 (or use a small internal QA build of the frontend
  aimed at :3002) and diff outputs/events against Node. The in-memory job store means the
  two systems stay independent — no shared-state coupling during the bridge.

**Phase 2 — Cutover**
- Switch the frontend's `API_BASE_URL` (or the reverse-proxy upstream) from the Node service
  to the Python service. No frontend code changes required.
- Watch logs (`logs/app-*.log`, `error-*.log`) and queue stats; the SSE/WS heartbeat
  confirms live connectivity.
- Roll back instantly by repointing the proxy back to Node if needed — both remain deployed.

**Phase 3 — Decommission & scale**
- After a soak period, retire the Node service.
- For >1000-image batches or multi-instance deployment, flip `QUEUE_BACKEND=redis` and run
  the separate worker container from `docker-compose.yml`, decoupling queue execution from
  the API process. The job repository interface (`IImageJobRepository`) is the single seam
  to swap the in-memory store for a Redis/Postgres-backed implementation without touching
  routers or use-cases.

**Downtime:** none — the cutover is a single proxy/origin switch with both stacks live and an
instant rollback path.
