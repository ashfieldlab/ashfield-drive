"""
글로벌 예외 처리 — 표준 응답 포맷.

처리 대상:
  - HTTPException: FastAPI 표준 응답 그대로
  - RequestValidationError: 필드별 detail
  - Exception (나머지): 500 + request_id 첨부 (운영에선 상세 메시지 마스킹)
"""

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.errors import BusinessError
from app.core.logging import get_request_id, logger


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exc_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "request_id": get_request_id(),
            },
            headers=exc.headers or None,
        )

    @app.exception_handler(BusinessError)
    async def business_exc_handler(_: Request, exc: BusinessError) -> JSONResponse:
        """도메인 비즈 에러 — code 기반 응답 (app/core/errors.py)."""
        logger.info(
            "business_error",
            extra={
                "category": "biz",
                "code": exc.code,
                "status": exc.status,
                "params": exc.params,
            },
        )
        return JSONResponse(
            status_code=exc.status,
            content={
                "code": exc.code,
                "message": exc.message,
                "params": exc.params,
                "request_id": get_request_id(),
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exc_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                # ctx.error 가 raw Exception 객체로 들어올 수 있어 JSON 직렬화 실패.
                # jsonable_encoder 로 안전 변환.
                "detail": jsonable_encoder(exc.errors()),
                "request_id": get_request_id(),
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exc_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "unhandled_exception",
            extra={"category": "api", "path": request.url.path, "error": str(exc)},
        )
        # 운영: 상세 메시지 노출 X
        is_prod = settings.environment == "production"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": "Internal server error" if is_prod else str(exc),
                "request_id": get_request_id(),
            },
        )
