import io
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models.support import SupportBundleRequest
from app.services.support_bundle import create_support_bundle


router = APIRouter(prefix="/api/support", tags=["support"])


@router.post("/bundle", response_class=StreamingResponse)
def support_bundle(request: SupportBundleRequest) -> StreamingResponse:
    filename, content = create_support_bundle(request)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
