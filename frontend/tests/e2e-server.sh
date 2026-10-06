#!/bin/sh
# Builds the static frontend and serves it from the real backend with a throwaway database,
# so e2e tests exercise the full stack. OpenRouter is never called: tests mock the AI route.
set -e
cd "$(dirname "$0")/.."
npm run build
DB_DIR="$(mktemp -d)"
cd ../backend
PM_DB_PATH="$DB_DIR/e2e.db" PM_STATIC_DIR="$(pwd)/../frontend/out" OPENROUTER_API_KEY="" \
  exec uv run uvicorn app.main:app --host 127.0.0.1 --port 8123
