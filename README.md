# AI Bulk Image Generator

A production-grade desktop application for bulk AI image generation using Google Gemini API.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended) — https://nodejs.org
- **npm** 8+
- **Google Gemini API key** — https://aistudio.google.com/app/apikey

> **Note:** Redis is NOT required. The queue uses an in-memory system for simplicity and portability.

---

## Quick Start (Development)

### 1. Clone / extract the project

```bash
cd ai-bulk-image-generator
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
copy .env.example .env       # Windows
# or
cp .env.example .env         # Mac/Linux
```

Edit `.env` — the defaults work fine for local dev. Your API key is set via the Settings UI.

### 4. Run in development mode

```bash
npm run dev
```

This starts three processes concurrently:
- **Backend** on `http://localhost:3001` (Express + Gemini service)
- **Frontend** on `http://localhost:5173` (Vite + React)
- **Electron** window (waits for both servers)

---

## First-Time Setup (In the App)

1. Open **Settings** in the sidebar
2. Paste your **Gemini API Key** → click **Validate**
3. Click **Browse** to set your **Output Folder**
4. Click **Save Settings**

Then:
1. Go to **Upload Center**
2. Drag & drop images or click **Select Files**
3. Type your **AI prompt** (e.g. "Create a luxury product photo")
4. Click **Queue Images** — processing starts automatically
5. Monitor progress in **Processing Queue**
6. View results in **Generated Gallery**

---

## Building for Production (Windows .exe)

```bash
# Install electron-builder globally (optional)
npm install -g electron-builder

# Build all layers then package
npm run package:win
```

The installer is output to `release/`. It creates a standard Windows NSIS installer.

### Other platforms

```bash
npm run package:mac    # macOS .dmg
npm run package:linux  # Linux .AppImage
```

---

## Project Structure

```
src/
├── backend/               # Express API server
│   ├── domain/            # Entities, repository interfaces
│   ├── application/       # Use cases, services, DTOs, errors
│   ├── infrastructure/    # Gemini, filesystem, logger, config
│   ├── presentation/      # Controllers, routes, middleware
│   └── server.ts          # Entry point
│
├── electron/
│   ├── main/              # Electron main process
│   └── preload/           # Secure IPC bridge
│
├── app/
│   ├── store/             # Zustand state stores
│   └── providers/         # SSE + React Query providers
│
├── modules/
│   ├── images/            # Dashboard + Upload pages
│   ├── queue/             # Queue management page
│   ├── gallery/           # Generated gallery page
│   └── settings/          # Settings page
│
└── shared/                # Types, constants, components, utils
```

---

## Architecture

Clean Architecture with four layers:

| Layer | Responsibility |
|-------|----------------|
| Domain | Entities (ImageJob, Settings), repository interfaces |
| Application | Use cases, ImageQueueService, DTOs, custom errors |
| Infrastructure | GeminiService, FileSystemService, WinstonLogger |
| Presentation | Express controllers, routes, Zod validators |

### Real-time Updates
The frontend connects to `GET /api/events` (Server-Sent Events). The backend broadcasts queue state changes every 2 seconds and on every job event. No WebSocket or Redis needed.

---

## Configuration Reference (`.env`)

| Key | Default | Description |
|-----|---------|-------------|
| `PORT` | `3001` | Backend port |
| `GEMINI_API_KEY` | _(empty)_ | Set via Settings UI instead |
| `QUEUE_CONCURRENCY` | `3` | Default concurrent workers |
| `QUEUE_MAX_RETRIES` | `3` | Default retry count |
| `OUTPUT_DIR` | `./output` | Default output directory |
| `IMAGE_QUALITY` | `90` | Default quality hint |
| `LOG_LEVEL` | `info` | Winston log level |

---

## Troubleshooting

### `Cannot find module config/config`
Your `server.ts` has a wrong import path. Replace:
```ts
import { getConfig } from './infrastructure/config/config';
```
with:
```ts
import { getConfig } from './infrastructure/config/index';
```

### `tsx: command not found`
```bash
npm install
# or install globally:
npm install -g tsx
```

### Gemini returns no image
- Ensure you're using `gemini-2.0-flash-exp` (image generation model)
- Some prompts trigger safety filters — try a different prompt
- Check the Logs folder in your output directory

### Port already in use
Change `PORT=3001` in `.env` and update `API_BASE_URL` in `src/shared/constants/index.ts`.

---

## Supported Image Formats

| Format | Input | Output |
|--------|-------|--------|
| JPEG/JPG | ✓ | ✓ |
| PNG | ✓ | ✓ |
| WEBP | ✓ | ✓ |

Max input size: **20MB per file**. Supports **1000+ images** in a single batch.

---

## Output Directory Structure

```
[Your Output Folder]/
├── Generated/    ← AI-generated images
├── Failed/       ← JSON error records for failed jobs
├── Logs/         ← Winston log files
└── Temp/         ← Temporary upload files (auto-cleaned)
```
# Ai-Bulk_Image_Generator
