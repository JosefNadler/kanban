from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

app = FastAPI(title="PM MVP Backend")

STATIC_DIR = Path(__file__).parent / "static"
INDEX_HTML = STATIC_DIR / "index.html"


@app.get("/", include_in_schema=False)
def serve_root() -> FileResponse:
    return FileResponse(INDEX_HTML)


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str) -> FileResponse:
    target = (STATIC_DIR / full_path).resolve()
    static_root = STATIC_DIR.resolve()

    if static_root not in target.parents and target != static_root:
        raise HTTPException(status_code=404, detail="Not found")

    if target.is_dir():
        candidate = target / "index.html"
        if candidate.exists():
            return FileResponse(candidate)

    if target.exists() and target.is_file():
        return FileResponse(target)

    if INDEX_HTML.exists():
        return FileResponse(INDEX_HTML)

    raise HTTPException(status_code=404, detail="Frontend build not found")
