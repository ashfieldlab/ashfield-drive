"""E2E 키 스키마 (ADR-0016): 전부 클라이언트가 만든 불투명 blob."""

from pydantic import BaseModel, Field


class E2EKeyBundle(BaseModel):
    """내 키 번들: 등록(PUT) / 조회(GET) 공용."""

    salt: str = Field(min_length=1, max_length=256)
    public_key: str = Field(min_length=1)
    enc_private_key: str = Field(min_length=1)
    enc_private_key_recovery: str = Field(min_length=1)


class E2EPublicKey(BaseModel):
    """타인 공개키: 공유 시 vault_key wrap 용."""

    user_sub: str
    public_key: str


class VaultCreate(BaseModel):
    """보안 폴더 생성: node_id(빈 폴더) + 생성자 본인용 wrapped vault_key."""

    node_id: str
    wrapped_vault_key: str = Field(min_length=1)


class VaultMemberCreate(BaseModel):
    """멤버 추가: 대상 user_sub + 그 사람 공개키로 wrap 한 vault_key."""

    user_sub: str
    wrapped_vault_key: str = Field(min_length=1)


class VaultMemberOut(BaseModel):
    user_sub: str
    created_at: str


class VaultOut(BaseModel):
    node_id: str
    company_id: str
    created_by: str
    # 요청자가 이 vault 의 멤버인지: 클라이언트가 접근 가능 여부를 미리 표시.
    is_member: bool = False
    # 요청자의 이 vault 에 대한 권한 (read/write/manage): 클라이언트가 읽기전용이면
    # 쓰기 버튼 숨김. 권한 없으면 None.
    my_permission: str | None = None


class WrappedKeyOut(BaseModel):
    """내 wrapped vault_key: 클라이언트가 개인키로 풀어 vault_key 복원."""

    node_id: str
    wrapped_vault_key: str
