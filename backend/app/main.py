import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.mikrotik import router as mikrotik_router
from app.api.support import router as support_router
from app.version import APP_VERSION


IS_DESKTOP_RUNTIME = os.environ.get("ORION_DESKTOP_RUNTIME") == "1"


app = FastAPI(
    title="ORION Field API",
    description="Backend do MikroTik Field Assistant.",
    version=APP_VERSION,
    docs_url=None if IS_DESKTOP_RUNTIME else "/docs",
    redoc_url=None if IS_DESKTOP_RUNTIME else "/redoc",
    openapi_url=None if IS_DESKTOP_RUNTIME else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=(
        ["http://tauri.localhost", "tauri://localhost"]
        if IS_DESKTOP_RUNTIME
        else [
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:8765",
            "http://127.0.0.1:8765",
            "http://tauri.localhost",
            "tauri://localhost",
        ]
    ),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(mikrotik_router)
app.include_router(support_router)


@app.get("/api/health", tags=["system"])
def health_check() -> dict[str, str]:
    """Confirm that the API is ready to receive requests."""
    return {
        "status": "ok",
        "service": "orion-field-api",
        "version": APP_VERSION,
    }


def mount_frontend(application: FastAPI, frontend_directory: Path) -> None:
    """Serve the compiled React application or explain how to build it."""
    if frontend_directory.is_dir():
        application.mount(
            "/",
            StaticFiles(directory=frontend_directory, html=True),
            name="frontend",
        )
        return

    @application.get("/", include_in_schema=False)
    def frontend_not_built() -> dict[str, str]:
        return {
            "status": "frontend_not_built",
            "message": "Execute npm run build na pasta frontend.",
        }


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if not IS_DESKTOP_RUNTIME:
    mount_frontend(app, FRONTEND_DIST)
