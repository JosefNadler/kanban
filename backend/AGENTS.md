# Backend guide

This folder contains the FastAPI backend for the Project Management MVP.

## Current scope (Parts 2-3)

- Serves statically exported frontend files at `/` from [app/static/](./app/static)
- Serves a demo JSON API endpoint at `/api/hello`
- Runs with `uv` using dependencies defined in [pyproject.toml](./pyproject.toml)

## Structure

- [app/main.py](./app/main.py): FastAPI app entrypoint and routes.
- [app/static/](./app/static): statically exported frontend build artifacts copied in Docker build.
- [pyproject.toml](./pyproject.toml): backend dependencies and uv project config.