"""
카테고리 로거: SPEC §3.11.

카테고리: auth | authz | api | db | cache | biz

사용:
    from app.core.logging import logger
    logger.info("login_success", extra={"category": "auth", "sub": sub})

환경변수:
    LOG_CATEGORIES=""        → 기본 (info 이상만 출력)
    LOG_CATEGORIES="auth,api" → 두 카테고리 debug 출력
    LOG_CATEGORIES="*"       → 전부 debug

포맷:
    ENVIRONMENT=development → 컬러 텍스트
    ENVIRONMENT=production  → JSON

request_id는 contextvars로 자동 주입.
"""

import json
import logging
import sys
from contextvars import ContextVar
from typing import Literal

from app.core.config import settings

Category = Literal["auth", "authz", "api", "db", "cache", "biz"]
_VALID_CATEGORIES: set[str] = {"auth", "authz", "api", "db", "cache", "biz"}

# -----------------------------------------------------------------------------
# request_id ContextVar: 미들웨어가 set, 로그 record가 read
# -----------------------------------------------------------------------------
_request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def set_request_id(request_id: str) -> None:
    _request_id_var.set(request_id)


def get_request_id() -> str | None:
    return _request_id_var.get()


# -----------------------------------------------------------------------------
# 카테고리 필터: LOG_CATEGORIES 환경변수 해석
# -----------------------------------------------------------------------------

def _parse_categories(raw: str) -> set[str] | None:
    """반환값:
       None  → 모든 카테고리에 대해 debug 출력
       set() → 빈 set은 "info 이상만"
       {...} → 해당 카테고리만 debug 출력 (그 외는 info 이상만)
    """
    raw = raw.strip()
    if raw == "*":
        return None
    if not raw:
        return set()
    return {c.strip() for c in raw.split(",") if c.strip()}


_debug_categories = _parse_categories(settings.log_categories)


class _CategoryFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno >= logging.INFO:
            return True
        # debug 레벨: 카테고리 화이트리스트 확인
        if _debug_categories is None:  # "*"
            return True
        category = getattr(record, "category", None)
        return isinstance(category, str) and category in _debug_categories


# -----------------------------------------------------------------------------
# 포맷터
# -----------------------------------------------------------------------------

class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "msg": record.getMessage(),
            "logger": record.name,
        }
        if rid := get_request_id():
            payload["request_id"] = rid
        # extra 필드 흡수
        for key, value in record.__dict__.items():
            if key in _RESERVED_LOG_KEYS:
                continue
            payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


_RESERVED_LOG_KEYS = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "asctime", "taskName",
}


class _TextFormatter(logging.Formatter):
    """개발용: 카테고리 + request_id 컬럼화."""

    _COLORS = {
        "DEBUG": "\033[36m",
        "INFO": "\033[32m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
        "CRITICAL": "\033[35m",
    }
    _RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self._COLORS.get(record.levelname, "")
        category = getattr(record, "category", "-")
        rid = get_request_id() or "-"
        extras = " ".join(
            f"{k}={v}"
            for k, v in record.__dict__.items()
            if k not in _RESERVED_LOG_KEYS and k != "category"
        )
        ts = self.formatTime(record, "%H:%M:%S")
        return (
            f"{color}{record.levelname:<5}{self._RESET} "
            f"{ts} [{category:<5}] [{rid[:8]:<8}] "
            f"{record.getMessage()}"
            + (f"  {extras}" if extras else "")
        )


# -----------------------------------------------------------------------------
# 셋업: 앱 부팅 시 한 번 호출
# -----------------------------------------------------------------------------

def setup_logging() -> None:
    root = logging.getLogger()
    # 기존 핸들러 제거 (uvicorn 등이 미리 박은 경우 회피)
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        _JsonFormatter() if settings.environment == "production" else _TextFormatter()
    )
    handler.addFilter(_CategoryFilter())

    root.addHandler(handler)
    root.setLevel(logging.DEBUG)  # 필터가 카테고리별로 거름


# -----------------------------------------------------------------------------
# 모듈 공용 logger: 모든 카테고리 호출자가 이 인스턴스 사용
# -----------------------------------------------------------------------------
logger = logging.getLogger("ashfield")


__all__ = ["logger", "setup_logging", "set_request_id", "get_request_id", "Category"]
