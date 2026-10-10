"""SMTP 설정 resolver: 회사 override → 전역 DB → env (C-4 가 회사 단계 추가).

호출자: services/email.py 의 send_for_event.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt
from app.models.smtp_config import CompanySmtpOverride, SystemSmtpConfig


@dataclass(frozen=True)
class SmtpRuntime:
    """발송 시점에 쓰는 평탄 구조.

    tls_mode:
      - 'none'     : 평문 SMTP (25 / 2525)
      - 'starttls' : SMTP + STARTTLS 업그레이드 (587 표준)
      - 'ssl'      : SMTPS implicit TLS (465)
    """

    host: str
    port: int
    user: str
    password: str  # 평문: DB row 라면 decrypt 후 채움
    tls_mode: str
    from_addr: str
    from_name: str
    source: str  # "company" | "system" | "env": 로그용


def _decrypt_safe(enc: str) -> str:
    if not enc:
        return ""
    try:
        return decrypt(enc)
    except ValueError:
        return ""  # 키 변경 등: 비로그인 SMTP 로 시도


async def resolve(
    db: AsyncSession, *, company_id: str | None = None
) -> SmtpRuntime | None:
    """SMTP 설정 한 건을 반환. 어디서도 못 찾으면 None.

    우선순위: company override → system DB → env.
    """
    # 1) Company override (있는 경우만)
    if company_id:
        ov = await db.get(CompanySmtpOverride, company_id)
        if ov is not None:
            return SmtpRuntime(
                host=ov.host,
                port=ov.port,
                user=ov.smtp_user,
                password=_decrypt_safe(ov.smtp_password_encrypted),
                tls_mode=ov.tls_mode,
                from_addr=ov.from_addr,
                from_name=ov.from_name,
                source="company",
            )

    # 2) System DB row
    sys_row = await db.get(SystemSmtpConfig, 1)
    if sys_row is not None:
        return SmtpRuntime(
            host=sys_row.host,
            port=sys_row.port,
            user=sys_row.smtp_user,
            password=_decrypt_safe(sys_row.smtp_password_encrypted),
            tls_mode=sys_row.tls_mode,
            from_addr=sys_row.from_addr,
            from_name=sys_row.from_name,
            source="system",
        )

    # 2) env fallback: smtp_enabled 가 true 일 때만 의미 있음
    if not settings.smtp_enabled:
        return None
    return SmtpRuntime(
        host=settings.smtp_host,
        port=settings.smtp_port,
        user=settings.smtp_user,
        password=settings.smtp_password,
        tls_mode="ssl" if settings.smtp_use_tls else "none",
        from_addr=settings.smtp_from,
        from_name=settings.smtp_from_name,
        source="env",
    )
