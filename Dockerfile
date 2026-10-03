FROM node:22-slim AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY backend/pyproject.toml backend/uv.lock /app/backend/
RUN cd /app/backend && uv sync --frozen --no-dev

COPY backend /app/backend
COPY --from=frontend-builder /frontend/out /app/backend/app/static
WORKDIR /app/backend

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
