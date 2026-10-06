import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from app.db import initialize_database
from app.routes import ai, auth, boards, users


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="PM Backend", lifespan=lifespan)

# API routers must be registered before the static catch-all route below.
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(boards.router)
app.include_router(ai.router)

# PM_STATIC_DIR lets integration tests serve a fresh frontend build without copying it here.
STATIC_DIR = Path(os.getenv("PM_STATIC_DIR") or Path(__file__).parent / "static")
INDEX_HTML = STATIC_DIR / "index.html"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str) -> FileResponse:
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    static_root = STATIC_DIR.resolve()
    target = (static_root / full_path).resolve()

    if static_root not in target.parents and target != static_root:
        raise HTTPException(status_code=404, detail="Not found")

    if target.is_dir():
        candidate = target / "index.html"
        if candidate.exists():
            return FileResponse(candidate)

    if target.is_file():
        return FileResponse(target)

    if INDEX_HTML.exists():
        return FileResponse(INDEX_HTML)

    raise HTTPException(status_code=404, detail="Frontend build not found")
