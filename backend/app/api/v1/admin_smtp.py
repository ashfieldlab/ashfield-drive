"""/api/v1/admin/smtp: System Admin 전역 SMTP 설정.

DB row 가 있으면 우선, 없으면 env fallback (services/smtp_config.resolve).
비밀번호는 Fernet 암호화 저장 + 마스킹 노출.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import require_admin
from app.core.crypto import decrypt, encrypt
from app.core.db import get_db
from app.core.logging import logger
from app.models.smtp_config import SystemSmtpConfig
from app.services.audit import write_audit
from app.services.email import _check_connection_sync, _send_sync
from app.services.smtp_config import SmtpRuntime
from app.services.smtp_config import resolve as resolve_smtp

router = APIRouter(prefix="/admin/smtp", tags=["admin"])

_PW_MASK = "••••••••"


class SmtpConfigResponse(BaseModel):
    host: str
    port: int
    smtp_user: str
    smtp_password: str  # 마스킹: 평문 노출 X
    tls_mode: str  # 'none' | 'starttls' | 'ssl'
    from_addr: str
    from_name: str
    source: str  # "system" | "env" | "none"


class SmtpConfigPatch(BaseModel):
    host: str
    port: int
    smtp_user: str = ""
    # 빈 문자열 → 비밀번호 미변경, 마스킹값(_PW_MASK) → 미변경, 그 외 → 갱신
    smtp_password: str = ""
    tls_mode: str = Field(default="none", pattern="^(none|starttls|ssl)$")
    from_addr: str
    from_name: str = ""


class SmtpTestRequest(BaseModel):
    to: str


class SmtpConnectionTestRequest(BaseModel):
    """폼 값으로 즉시 연결 테스트 (저장 전). password 가 빈 값/마스킹이면 DB row 값 사용."""

    host: str
    port: int
    smtp_user: str = ""
    smtp_password: str = ""
    tls_mode: str = Field(default="none", pattern="^(none|starttls|ssl)$")


@router.get(
    "",
    response_model=SmtpConfigResponse,
    summary="현재 SMTP 설정 (System Admin)",
)
async def get_smtp(
    _: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SmtpConfigResponse:
    cfg = await resolve_smtp(db)
    if cfg is None:
        return SmtpConfigResponse(
            host="", port=0, smtp_user="", smtp_password="",
            tls_mode="none", from_addr="", from_name="", source="none",
        )
    return SmtpConfigResponse(
        host=cfg.host,
        port=cfg.port,
        smtp_user=cfg.user,
        smtp_password=_PW_MASK if cfg.password else "",
        tls_mode=cfg.tls_mode,
        from_addr=cfg.from_addr,
        from_name=cfg.from_name,
        source=cfg.source,
    )


@router.patch(
    "",
    response_model=SmtpConfigResponse,
    summary="전역 SMTP 설정 저장 (System Admin)",
    responses={400: {"description": "암호화 키 미설정"}},
)
async def patch_smtp(
    body: SmtpConfigPatch,
    actor: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SmtpConfigResponse:
    row = await db.get(SystemSmtpConfig, 1)
    is_new = row is None
    if row is None:
        row = SystemSmtpConfig(id=1, host="", port=0, from_addr="")
        db.add(row)

    row.host = body.host
    row.port = body.port
    row.smtp_user = body.smtp_user
    row.tls_mode = body.tls_mode
    row.from_addr = body.from_addr
    row.from_name = body.from_name

    # 비밀번호: 마스킹 또는 빈 문자열은 미변경, 그 외만 재암호화 저장
    if body.smtp_password and body.smtp_password != _PW_MASK:
        try:
            row.smtp_password_encrypted = encrypt(body.smtp_password)
        except RuntimeError as exc:
            raise HTTPException(400, str(exc)) from exc

    await write_audit(
        db,
        workspace_id=None,  # 시스템 레벨: D-1 이후 NULL 허용
        actor=actor,
        action="create" if is_new else "update",
        entity_type="system_smtp_config",
        entity_id="1",
        meta={"host": body.host, "port": body.port, "from_addr": body.from_addr},
    )
    await db.commit()
    logger.info(
        "system_smtp_updated",
        extra={
            "category": "biz",
            "host": body.host,
            "actor": actor.sub,
            "is_new": is_new,
        },
    )
    return SmtpConfigResponse(
        host=row.host,
        port=row.port,
        smtp_user=row.smtp_user,
        smtp_password=_PW_MASK if row.smtp_password_encrypted else "",
        tls_mode=row.tls_mode,
        from_addr=row.from_addr,
        from_name=row.from_name,
        source="system",
    )


@router.post(
    "/connection-test",
    summary="발송 없이 SMTP 연결+인증만 확인 (System Admin)",
    responses={400: {"description": "연결, 인증 실패"}},
)
async def test_smtp_connection(
    body: SmtpConnectionTestRequest,
    _: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # 비밀번호: 빈/마스킹이면 저장된 row 의 평문으로 보완 (저장 전 검증 시 편의)
    password = body.smtp_password
    if not password or password == _PW_MASK:
        row = await db.get(SystemSmtpConfig, 1)
        if row and row.smtp_password_encrypted:
            try:
                password = decrypt(row.smtp_password_encrypted)
            except ValueError:
                password = ""
        else:
            password = ""

    cfg = SmtpRuntime(
        host=body.host,
        port=body.port,
        user=body.smtp_user,
        password=password,
        tls_mode=body.tls_mode,
        from_addr="",  # connection-test 는 EHLO/AUTH 만, from 무관
        from_name="",
        source="form",
    )
    try:
        await asyncio.to_thread(_check_connection_sync, cfg)
    except Exception as exc:
        logger.info(
            "smtp_connection_test_failed",
            extra={
                "category": "biz",
                "host": body.host,
                "port": body.port,
                "tls_mode": body.tls_mode,
                "error": str(exc),
            },
        )
        raise HTTPException(400, f"SMTP connection failed: {exc}") from exc
    return {"ok": True}


@router.post(
    "/test",
    summary="테스트 메일 발송 (System Admin)",
    responses={400: {"description": "SMTP 미설정"}},
)
async def test_smtp(
    body: SmtpTestRequest,
    actor: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cfg: SmtpRuntime | None = await resolve_smtp(db)
    if cfg is None:
        raise HTTPException(400, "No SMTP configuration available")
    subject = "[Workspace] SMTP 테스트 메일"
    text = (
        f"{actor.sub} 가 발송한 SMTP 테스트 메일입니다.\n"
        f"source={cfg.source} host={cfg.host}:{cfg.port}\n"
    )
    try:
        await asyncio.to_thread(_send_sync, cfg, body.to, subject, text)
    except Exception as exc:
        logger.warning(
            "smtp_test_failed",
            extra={"category": "biz", "error": str(exc), "host": cfg.host},
        )
        raise HTTPException(400, f"SMTP send failed: {exc}") from exc
    return {"ok": True, "source": cfg.source, "to": body.to}
