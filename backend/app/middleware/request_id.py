"""
Request ID 미들웨어 — X-Request-ID 헤더 자동 주입·전파.

요청에 X-Request-ID가 있으면 그대로 사용, 없으면 새 UUID 발급.
응답 헤더에도 동일 값을 박아 클라이언트가 추적 가능.
"""

from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import set_request_id

_REQUEST_ID_HEADER = "X-Request-ID"


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(_REQUEST_ID_HEADER) or str(uuid4())
        set_request_id(request_id)
        response: Response = await call_next(request)
        response.headers[_REQUEST_ID_HEADER] = request_id
        return response
