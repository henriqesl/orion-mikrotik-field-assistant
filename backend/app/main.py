from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.mikrotik import router as mikrotik_router


app = FastAPI(
    title="ORION Field API",
    description="Backend do MikroTik Field Assistant.",
    version="0.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(mikrotik_router)


@app.get("/api/health", tags=["system"])
def health_check() -> dict[str, str]:
    """Confirm that the API is ready to receive requests."""
    return {"status": "ok", "service": "orion-field-api"}
