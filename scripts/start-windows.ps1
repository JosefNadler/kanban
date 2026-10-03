$ErrorActionPreference = "Stop"

docker compose up --build -d
docker compose ps
Write-Host "App should be available at http://localhost:8000"
