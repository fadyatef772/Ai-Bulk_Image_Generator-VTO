# ── AI Bulk Image Generator — Python backend ────────────────────────────────
FROM python:3.11-bookworm
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps (build tools for some google libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY app ./app
COPY .env.example ./.env.example

# Non-root user
RUN useradd -m appuser && mkdir -p /app/output /app/logs && chown -R appuser:appuser /app
USER appuser

EXPOSE 3001

# Default: run API + in-process worker pool.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
