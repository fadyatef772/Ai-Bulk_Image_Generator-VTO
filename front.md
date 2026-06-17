# AI Bulk Image Generator — Frontend

Premium dark-navy **SaaS** frontend for the AI Bulk Image Generator, built to the design
spec and wired to the FastAPI (Python) backend.

**Stack:** React 18 · TypeScript · Vite · Tailwind CSS · shadcn-style components ·
Lucide icons · Framer Motion · TanStack Query · Zustand.

## Pages

- **Dashboard** — 4 stat cards (Total / Completed / Pending / Failed), live Processing
  Progress panel with empty state, and a Quick Actions panel with a Performance section.
- **Upload Center** — drag-and-drop bulk upload, per-file validation, prompt editor with
  examples.
- **Processing Queue** — start/pause/resume/stop controls, live progress, per-job
  retry/cancel/delete.
- **Generated Gallery** — search + status filters, responsive image grid, lightbox, download.
- **Settings** — AI provider selector (Gemini · Vertex · Dust), provider-specific config,
  the Vertex `gcloud auth application-default login` authentication box, and processing options.

## Design system

The exact palette and typography from the spec are encoded in `tailwind.config.ts` and
`src/index.css`:

| Token | Value |
|-------|-------|
| Background | `#020B24` |
| Sidebar | `#050F2F` |
| Cards | `#091632` |
| Borders | `rgba(80,120,255,0.15)` |
| Primary Blue | `#0EA5E9` |
| Secondary Blue | `#3B82F6` |
| Text Primary / Secondary | `#F8FAFC` / `#7C8AA5` |
| Success / Warning / Danger | `#10B981` / `#F59E0B` / `#EF4444` |

Font is **Inter**; the dashboard title is 40px, section titles 24px, stat values 42px.
The futuristic diagonal light-streaks + glassmorphism live in `StreakOverlay` and the
`.glass-card` / `.glass-input` utilities. Framer Motion drives sidebar, card hover, button
glow, page transitions, and dropdown animations.

## Backend wiring

This frontend talks to the FastAPI backend (the `ai-bulk-python` project). All endpoints,
the `{success, data}` envelope, the SSE event names, and the `/output/Generated/...` image
URLs match that backend exactly. The dev server runs on **:5173**, which the backend's CORS
already allows.

Endpoints used: `POST /api/images/upload`, `GET /api/images`, `DELETE /api/images/{id}`,
`POST /api/images/{id}/retry|cancel`, `GET /api/queue/stats`,
`POST /api/queue/start|pause|resume|stop|cancel`, `GET|PUT /api/settings`,
`POST /api/settings/validate-key|select-folder|open-folder`, and the SSE stream `GET /api/events`.

## Run

```bash
npm install
cp .env.example .env      # defaults already point at http://localhost:3001
npm run dev               # http://localhost:5173
```

Start the Python backend first (`uvicorn app.main:app --port 3001`), then the frontend. The
sidebar's connection dot turns green once the SSE stream connects.

## Build

```bash
npm run build             # tsc + vite build → dist/
npm run preview
```

Configure a different backend host via `.env`:

```
VITE_API_BASE_URL=http://your-host:3001/api
VITE_SSE_URL=http://your-host:3001/api/events
VITE_OUTPUT_STATIC_URL=http://your-host:3001/output
```
