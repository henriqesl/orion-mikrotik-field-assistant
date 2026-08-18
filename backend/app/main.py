from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.mikrotik import router as mikrotik_router


app = FastAPI(
    title="ORION Field API",
    description="Backend do MikroTik Field Assistant.",
    version="0.5.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:8765",
        "http://127.0.0.1:8765",
        "http://tauri.localhost",
        "tauri://localhost",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(mikrotik_router)


@app.get("/api/health", tags=["system"])
def health_check() -> dict[str, str]:
    """Confirm that the API is ready to receive requests."""
    return {"status": "ok", "service": "orion-field-api"}


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
mount_frontend(app, FRONTEND_DIST)
