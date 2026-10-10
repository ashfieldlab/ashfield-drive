"""E2E 암호화: 사용자 키 번들 (ADR-0016).

봉투 암호화의 사용자별 키 보관소. **서버는 평문을 절대 보지 않는다**: 전부
클라이언트에서 암호화된 불투명 blob 만 저장.

키 체인 (복호화 방향):
  비밀번호 ─argon2id(salt)→ KEK ─AES풂→ 개인키 ─RSA풂→ vault_key ─AES풂→ {파일명, DEK} ─AES풂→ 파일

이 테이블이 담는 것:
  - salt: KEK 유도용 (평문, 비밀 아님)
  - public_key: RSA-OAEP 공개키 (평문: 잠그기 전용, 공유 시 타인이 사용)
  - enc_private_key: 개인키를 KEK(비밀번호) 로 암호화한 것
  - enc_private_key_recovery: 개인키를 복구코드로 암호화한 것 (분실 대비)

비밀번호·KEK·개인키 평문·복구코드 는 어디에도 저장 안 됨.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class E2EUserKey(Base):
    __tablename__ = "e2e_user_keys"

    # 사용자 식별자 (JWT sub). 사용자당 1 키쌍.
    user_sub: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # argon2id salt (base64): 평문 저장 (rainbow table 방어용, 비밀 아님)
    salt: Mapped[str] = mapped_column(String(256), nullable=False)
    # RSA-OAEP 공개키 (base64 SPKI): 평문. 공유 시 타인이 이걸로 vault_key wrap.
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    # 개인키 (PKCS8) 를 KEK(비밀번호 유도) 로 AES-GCM 암호화: base64(iv+ct)
    enc_private_key: Mapped[str] = mapped_column(Text, nullable=False)
    # 같은 개인키를 복구코드 유도 KEK 로 암호화: 비밀번호 분실 시 복구 경로
    enc_private_key_recovery: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
