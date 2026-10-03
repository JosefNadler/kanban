#!/usr/bin/env bash
set -euo pipefail

docker compose up --build -d
docker compose ps
echo "App should be available at http://localhost:8000"
