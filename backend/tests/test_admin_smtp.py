"""/api/v1/admin/smtp — 전역 SMTP CRUD + 암호화 마스킹."""

import pytest


@pytest.mark.asyncio
async def test_smtp_requires_system_admin(client, auth_headers):
    res = await client.get(
        "/api/v1/admin/smtp",
        headers=auth_headers("user", groups=["acme-corp"]),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_smtp_get_falls_back_to_env(client, auth_headers, monkeypatch):
    """DB row 없으면 env fallback (smtp_enabled=true 일 때)."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "smtp_enabled", True)
    monkeypatch.setattr(settings, "smtp_host", "localhost")
    monkeypatch.setattr(settings, "smtp_port", 11025)
    monkeypatch.setattr(settings, "smtp_from", "noreply@test.local")

    res = await client.get(
        "/api/v1/admin/smtp",
        headers=auth_headers("sys", roles=["admin"]),
    )
    body = res.json()
    assert body["source"] == "env"
    assert body["host"] == "localhost"
    assert body["port"] == 11025


@pytest.mark.asyncio
async def test_smtp_patch_then_get_masks_password(client, auth_headers):
    """PATCH 로 저장한 비밀번호는 GET 응답에 마스킹돼야 함."""
    h = auth_headers("sys", roles=["admin"])
    res = await client.patch(
        "/api/v1/admin/smtp",
        headers=h,
        json={
            "host": "smtp.example.com",
            "port": 587,
            "smtp_user": "alerts",
            "smtp_password": "supersecret123",
            "tls_mode": "starttls",
            "from_addr": "noreply@example.com",
            "from_name": "Workspace",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["host"] == "smtp.example.com"
    assert body["smtp_password"] == "••••••••"
    assert body["source"] == "system"

    res = await client.get("/api/v1/admin/smtp", headers=h)
    body = res.json()
    assert body["smtp_password"] == "••••••••"
    assert body["host"] == "smtp.example.com"


@pytest.mark.asyncio
async def test_smtp_patch_preserves_password_when_masked(client, auth_headers, db_session):
    """마스킹 값으로 PATCH 시 비밀번호 미변경 — 다른 필드만 갱신."""
    from app.core.crypto import decrypt
    from app.models.smtp_config import SystemSmtpConfig

    h = auth_headers("sys", roles=["admin"])
    await client.patch(
        "/api/v1/admin/smtp",
        headers=h,
        json={
            "host": "a", "port": 25, "smtp_user": "u",
            "smtp_password": "original-pw", "tls_mode": "none",
            "from_addr": "a@b.c", "from_name": "",
        },
    )
    # 마스킹값으로 갱신
    await client.patch(
        "/api/v1/admin/smtp",
        headers=h,
        json={
            "host": "b", "port": 587, "smtp_user": "u",
            "smtp_password": "••••••••", "tls_mode": "ssl",
            "from_addr": "a@b.c", "from_name": "",
        },
    )
    row = await db_session.get(SystemSmtpConfig, 1)
    assert row.host == "b"
    assert row.tls_mode == "ssl"
    assert decrypt(row.smtp_password_encrypted) == "original-pw"


@pytest.mark.asyncio
async def test_smtp_test_send_delivers(client, auth_headers, monkeypatch):
    """테스트 발송이 실제 _send_sync 시그니처로 메일을 만든다 (예전엔 인자 불일치로 400)."""
    import app.services.email as email_svc
    from app.core.config import settings

    monkeypatch.setattr(settings, "smtp_enabled", True)
    monkeypatch.setattr(settings, "smtp_host", "localhost")
    monkeypatch.setattr(settings, "smtp_from", "noreply@test.local")
    sent = []

    class FakeSMTP:
        def __init__(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def send_message(self, msg):
            sent.append(msg)

    monkeypatch.setattr(email_svc, "SMTP", FakeSMTP)
    res = await client.post(
        "/api/v1/admin/smtp/test",
        json={"to": "ops@test.local"},
        headers=auth_headers("sys", roles=["admin"]),
    )
    assert res.status_code == 200, res.text
    assert sent and sent[0]["To"] == "ops@test.local"
