"""Fernet 대칭 암호화 헬퍼.

용도: DB 저장 비밀번호(SMTP 등) 보호. 평문 노출 방지.

키: settings.smtp_encryption_key (env SMTP_ENCRYPTION_KEY): 32 bytes base64.
키 없으면 부팅 시 RuntimeError: SMTP DB 설정 기능 비활성 의미.
"""

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    key = settings.smtp_encryption_key
    if not key:
        raise RuntimeError(
            "SMTP_ENCRYPTION_KEY is not set: DB-based SMTP config disabled."
        )
    return Fernet(key.encode())


def encrypt(plaintext: str) -> str:
    """평문 → URL-safe base64 ciphertext."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """ciphertext → 평문. 키 변경 등으로 복호화 실패 시 ValueError."""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("decryption failed (key changed?)") from exc
