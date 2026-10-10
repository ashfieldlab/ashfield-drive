"""/api/v1/workspaces/{id}/smtp: Workspace Admin 워크스페이스별 SMTP override.

System Admin 도 자동 통과 (require_workspace_admin 가 super-set).
override row 가 있으면 resolve 가 전역보다 우선 적용 (services/smtp_config).
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import require_workspace_admin
from app.core.crypto import decrypt, encrypt
from app.core.db import get_db
from app.core.logging import logger
from app.models.smtp_config import WorkspaceSmtpOverride
from app.services.email import _check_connection_sync, _send_sync
from app.services.smtp_config import SmtpRuntime
from app.services.smtp_config import resolve as resolve_smtp

router = APIRouter(prefix="/workspaces/{workspace_id}/smtp", tags=["workspace"])

_PW_MASK = "••••••••"


class WorkspaceSmtpResponse(BaseModel):
    override_enabled: bool
    host: str
    port: int
    smtp_user: str
    smtp_password: str  # 마스킹
    tls_mode: str  # 'none' | 'starttls' | 'ssl'
    from_addr: str
    from_name: str
    # 실제 발송 시 사용될 source: UI 표시용. workspace/system/env/none.
    effective_source: str


class WorkspaceSmtpPatch(BaseModel):
    host: str
    port: int
    smtp_user: str = ""
    smtp_password: str = ""
    tls_mode: str = Field(default="none", pattern="^(none|starttls|ssl)$")
    from_addr: str
    from_name: str = ""


class SmtpTestRequest(BaseModel):
    to: str


class SmtpConnectionTestRequest(BaseModel):
    """폼 값 기반 연결 테스트. password 가 빈/마스킹이면 DB row 값 사용."""

    host: str
    port: int
    smtp_user: str = ""
    smtp_password: str = ""
    tls_mode: str = Field(default="none", pattern="^(none|starttls|ssl)$")


@router.get(
    "",
    response_model=WorkspaceSmtpResponse,
    summary="워크스페이스 SMTP override 조회 (Workspace Admin)",
)
async def get_workspace_smtp(
    workspace_id: str = Path(...),
    _: UserContext = Depends(require_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceSmtpResponse:
    ov = await db.get(WorkspaceSmtpOverride, workspace_id)
    effective = await resolve_smtp(db, workspace_id=workspace_id)
    if ov is None:
        return WorkspaceSmtpResponse(
            override_enabled=False,
            host="", port=0, smtp_user="", smtp_password="",
            tls_mode="none", from_addr="", from_name="",
            effective_source=effective.source if effective else "none",
        )
    return WorkspaceSmtpResponse(
        override_enabled=True,
        host=ov.host,
        port=ov.port,
        smtp_user=ov.smtp_user,
        smtp_password=_PW_MASK if ov.smtp_password_encrypted else "",
        tls_mode=ov.tls_mode,
        from_addr=ov.from_addr,
        from_name=ov.from_name,
        effective_source=effective.source if effective else "none",
    )


@router.put(
    "",
    response_model=WorkspaceSmtpResponse,
    summary="워크스페이스 SMTP override 저장 (Workspace Admin)",
)
async def put_workspace_smtp(
    body: WorkspaceSmtpPatch,
    workspace_id: str = Path(...),
    actor: UserContext = Depends(require_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceSmtpResponse:
    ov = await db.get(WorkspaceSmtpOverride, workspace_id)
    is_new = ov is None
    if ov is None:
        ov = WorkspaceSmtpOverride(
            workspace_id=workspace_id, host="", port=0, from_addr=""
        )
        db.add(ov)
    ov.host = body.host
    ov.port = body.port
    ov.smtp_user = body.smtp_user
    ov.tls_mode = body.tls_mode
    ov.from_addr = body.from_addr
    ov.from_name = body.from_name
    if body.smtp_password and body.smtp_password != _PW_MASK:
        try:
            ov.smtp_password_encrypted = encrypt(body.smtp_password)
        except RuntimeError as exc:
            raise HTTPException(400, str(exc)) from exc
    await db.commit()
    logger.info(
        "workspace_smtp_updated",
        extra={
            "category": "biz",
            "workspace_id": workspace_id,
            "host": body.host,
            "actor": actor.sub,
            "is_new": is_new,
        },
    )
    return WorkspaceSmtpResponse(
        override_enabled=True,
        host=ov.host,
        port=ov.port,
        smtp_user=ov.smtp_user,
        smtp_password=_PW_MASK if ov.smtp_password_encrypted else "",
        tls_mode=ov.tls_mode,
        from_addr=ov.from_addr,
        from_name=ov.from_name,
        effective_source="workspace",
    )


@router.delete(
    "",
    status_code=204,
    summary="워크스페이스 SMTP override 삭제: 전역 SMTP 사용으로 복귀 (Workspace Admin)",
)
async def delete_workspace_smtp(
    workspace_id: str = Path(...),
    actor: UserContext = Depends(require_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    ov = await db.get(WorkspaceSmtpOverride, workspace_id)
    if ov is None:
        return
    await db.delete(ov)
    await db.commit()
    logger.info(
        "workspace_smtp_removed",
        extra={"category": "biz", "workspace_id": workspace_id, "actor": actor.sub},
    )


@router.post(
    "/connection-test",
    summary="발송 없이 SMTP 연결+인증만 확인 (Workspace Admin)",
    responses={400: {"description": "연결·인증 실패"}},
)
async def test_workspace_smtp_connection(
    body: SmtpConnectionTestRequest,
    workspace_id: str = Path(...),
    _: UserContext = Depends(require_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    password = body.smtp_password
    if not password or password == _PW_MASK:
        ov = await db.get(WorkspaceSmtpOverride, workspace_id)
        if ov and ov.smtp_password_encrypted:
            try:
                password = decrypt(ov.smtp_password_encrypted)
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
        from_addr="",
        from_name="",
        source="form",
    )
    try:
        await asyncio.to_thread(_check_connection_sync, cfg)
    except Exception as exc:
        logger.info(
            "workspace_smtp_connection_test_failed",
            extra={
                "category": "biz",
                "workspace_id": workspace_id,
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
    summary="워크스페이스 SMTP 테스트 메일 발송 (Workspace Admin)",
    responses={400: {"description": "SMTP 미설정"}},
)
async def test_workspace_smtp(
    body: SmtpTestRequest,
    workspace_id: str = Path(...),
    actor: UserContext = Depends(require_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cfg = await resolve_smtp(db, workspace_id=workspace_id)
    if cfg is None:
        raise HTTPException(400, "No SMTP configuration available")
    subject = "[Workspace] 워크스페이스 SMTP 테스트 메일"
    text = (
        f"{actor.sub} 가 워크스페이스({workspace_id}) 컨텍스트로 발송한 테스트 메일.\n"
        f"source={cfg.source} host={cfg.host}:{cfg.port}\n"
    )
    try:
        await asyncio.to_thread(_send_sync, cfg, body.to, subject, text)
    except Exception as exc:
        logger.warning(
            "workspace_smtp_test_failed",
            extra={"category": "biz", "workspace_id": workspace_id, "error": str(exc)},
        )
        raise HTTPException(400, f"SMTP send failed: {exc}") from exc
    return {"ok": True, "source": cfg.source, "to": body.to}
