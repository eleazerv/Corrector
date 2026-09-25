import re
import time
from uuid import uuid4
from fastapi import Request
from fastapi.responses import JSONResponse

from core.logging import log
from core.errors import _body

_RID_RE = re.compile(r"^[A-Za-z0-9\-]{1,64}$")

async def request_context_middleware(request: Request, call_next):
    incoming = request.headers.get("X-Request-Id", "")
    request_id = incoming if _RID_RE.match(incoming) else str(uuid4())
    request.state.request_id = request_id
    start = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        log.exception("Unhandled error rid=%s", request_id)
        response = JSONResponse(status_code=500,
                                content=_body("INTERNAL", "Internal Error", {"request_id": request_id}))

    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-Id"] = request_id
    log.info("%s %s -> %s (%.0fms) rid=%s", request.method, request.url.path,
             response.status_code, duration_ms, request_id)
    return response