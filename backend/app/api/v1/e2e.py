"""E2E 키 엔드포인트 (ADR-0016).

서버는 암호 연산을 하지 않는다: 클라이언트가 만든 불투명 blob 의 보관·배달만.
키 번들 등록/조회 + 타인 공개키 조회(공유용).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.db import get_db
from app.models.e2e_key import E2EUserKey
from app.models.node import Node
from app.models.vault import Vault, VaultMember
from app.schemas.e2e import (
    E2EKeyBundle,
    E2EPublicKey,
    VaultCreate,
    VaultMemberCreate,
    VaultMemberOut,
    VaultOut,
    WrappedKeyOut,
)
from app.services.nodes import (
    assert_access,
    effective_permission,
    get_node_or_404,
    is_team_folder_content,
    new_node_id,
)

_RANK_NAME = {3: "manage", 2: "write", 1: "read", 0: None}

router = APIRouter(prefix="/e2e", tags=["e2e"])


async def _require_member(db: AsyncSession, vault_id: str, user_sub: str) -> VaultMember:
    m = (
        await db.execute(
            select(VaultMember).where(
                VaultMember.vault_id == vault_id, VaultMember.user_sub == user_sub
            )
        )
    ).scalar_one_or_none()
    if m is None:
        raise HTTPException(404, "Vault not found")  # 비멤버엔 존재 마스킹
    return m


@router.get(
    "/keys/me",
    response_model=E2EKeyBundle,
    summary="내 E2E 키 번들: 잠금해제용 (salt + 암호화된 개인키)",
    responses={404: {"description": "아직 E2E 키 미설정 (vault 첫 사용 전)"}},
)
async def get_my_keys(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> E2EKeyBundle:
    row = await db.get(E2EUserKey, user.sub)
    if row is None:
        raise HTTPException(404, "E2E keys not set up")
    return E2EKeyBundle(
        salt=row.salt,
        public_key=row.public_key,
        enc_private_key=row.enc_private_key,
        enc_private_key_recovery=row.enc_private_key_recovery,
    )


@router.put(
    "/keys/me",
    response_model=E2EKeyBundle,
    summary="내 E2E 키 번들 등록/교체 (첫 설정 또는 비밀번호 변경)",
)
async def put_my_keys(
    body: E2EKeyBundle,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> E2EKeyBundle:
    """클라이언트가 키쌍 생성 + 개인키를 KEK/복구코드로 암호화해 보냄.

    ⚠️ public_key 교체는 기존 wrapped vault_key 들을 무효화한다 (다른 공개키로
    감싸졌으므로). 첫 설정 / 같은 키쌍 재암호화(비밀번호 변경) 에만 사용.
    키쌍 자체 rotation 은 vault 재초대가 필요 (V2+ 에서 다룸).
    """
    row = await db.get(E2EUserKey, user.sub)
    if row is None:
        row = E2EUserKey(user_sub=user.sub)
        db.add(row)
    row.salt = body.salt
    row.public_key = body.public_key
    row.enc_private_key = body.enc_private_key
    row.enc_private_key_recovery = body.enc_private_key_recovery
    await db.commit()
    return body


@router.get(
    "/keys/{user_sub}/public",
    response_model=E2EPublicKey,
    summary="타인 공개키: vault 공유 시 vault_key wrap 용",
    responses={404: {"description": "그 사용자가 E2E 키 미설정"}},
)
async def get_public_key(
    user_sub: str,
    _: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> E2EPublicKey:
    """공개키는 평문: 누구나 조회 가능 (잠그기 전용이라 노출 무해)."""
    row = (
        await db.execute(
            select(E2EUserKey.public_key).where(E2EUserKey.user_sub == user_sub)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "User has no E2E key")
    return E2EPublicKey(user_sub=user_sub, public_key=row)


# ---------------------------------------------------------------------------
# Vault (보안 폴더): folder 에 E2E 적용 + 멤버십. 서버는 wrap 된 key 만 보관.
# ---------------------------------------------------------------------------


@router.post(
    "/vaults",
    response_model=VaultOut,
    summary="보안 폴더 생성: 빈 folder 를 vault 로 (생성자 자동 멤버)",
    responses={
        400: {"description": "folder 아님 / 비어있지 않음 / 이미 vault"},
        403: {"description": "folder write 권한 없음"},
    },
)
async def create_vault(
    body: VaultCreate,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> VaultOut:
    """vault_key 는 클라이언트가 생성 + 본인 공개키로 wrap 해서 보냄.

    빈 폴더만 가능: 기존 파일은 평문이라 재암호화 문제 회피 (ADR-0016).
    """
    node = await get_node_or_404(db, body.node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="write")
    if node.kind != "folder":
        raise HTTPException(400, "Vault must be a folder")
    if await db.get(Vault, node.id):
        raise HTTPException(400, "Already a vault")
    # 팀 폴더 안에는 vault 금지: E2E 멤버십(명시 키)은 부서 동적 멤버십과 직교.
    # (docs/group-sharing.html 제약)
    if await is_team_folder_content(db, node.id):
        raise HTTPException(400, "팀 폴더 안에는 보안 폴더를 만들 수 없습니다.")
    child_count = (
        await db.execute(
            select(func.count())
            .select_from(Node)
            .where(Node.parent_id == node.id, Node.deleted_at.is_(None))
        )
    ).scalar_one()
    if child_count > 0:
        raise HTTPException(400, "Vault folder must be empty")

    db.add(Vault(node_id=node.id, company_id=company_id, created_by=user.sub))
    db.add(
        VaultMember(
            id=new_node_id(),
            vault_id=node.id,
            user_sub=user.sub,
            wrapped_vault_key=body.wrapped_vault_key,
        )
    )
    await db.commit()
    return VaultOut(
        node_id=node.id, company_id=company_id, created_by=user.sub, is_member=True
    )


@router.get(
    "/vaults",
    response_model=list[VaultOut],
    summary="활성 회사의 vault 목록: 클라이언트가 암호화 폴더 식별",
)
async def list_vaults(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> list[VaultOut]:
    rows = (
        await db.execute(select(Vault).where(Vault.company_id == company_id))
    ).scalars().all()
    # 요청자가 멤버인 vault 집합: 비멤버 폴더는 클라이언트가 "접근 권한 없음" 표시.
    member_ids = set(
        (
            await db.execute(
                select(VaultMember.vault_id).where(VaultMember.user_sub == user.sub)
            )
        )
        .scalars()
        .all()
    )
    out: list[VaultOut] = []
    for v in rows:
        node = await db.get(Node, v.node_id)
        rank = (
            await effective_permission(db, node, user=user, company_id=company_id)
            if node is not None
            else 0
        )
        out.append(
            VaultOut(
                node_id=v.node_id,
                company_id=v.company_id,
                created_by=v.created_by,
                is_member=v.node_id in member_ids,
                my_permission=_RANK_NAME.get(rank),
            )
        )
    return out


@router.get(
    "/vaults/{node_id}/key",
    response_model=WrappedKeyOut,
    summary="내 wrapped vault_key: 개인키로 풀어 vault_key 복원",
    responses={404: {"description": "vault 없음 또는 비멤버"}},
)
async def get_vault_key(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    _: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> WrappedKeyOut:
    m = await _require_member(db, node_id, user.sub)
    return WrappedKeyOut(node_id=node_id, wrapped_vault_key=m.wrapped_vault_key)


@router.get(
    "/vaults/{node_id}/members",
    response_model=list[VaultMemberOut],
    summary="vault 멤버 목록 (멤버만 조회)",
)
async def list_vault_members(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    _: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> list[VaultMemberOut]:
    await _require_member(db, node_id, user.sub)
    rows = (
        await db.execute(
            select(VaultMember).where(VaultMember.vault_id == node_id)
        )
    ).scalars().all()
    return [
        VaultMemberOut(user_sub=m.user_sub, created_at=m.created_at.isoformat())
        for m in rows
    ]


@router.post(
    "/vaults/{node_id}/members",
    response_model=VaultMemberOut,
    summary="멤버 추가 (공유): 멤버만 가능. wrapped_vault_key 는 대상 공개키로 wrap",
    responses={
        404: {"description": "vault 없음 또는 요청자 비멤버"},
        409: {"description": "이미 멤버"},
    },
)
async def add_vault_member(
    node_id: str,
    body: VaultMemberCreate,
    user: UserContext = Depends(get_current_user),
    _: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> VaultMemberOut:
    """기존 멤버만 추가 가능: vault_key 를 가진 사람이 대상 공개키로 re-wrap.

    서버는 wrap 된 것만 받음 (vault_key 평문은 클라이언트에만).
    """
    await _require_member(db, node_id, user.sub)
    exists = (
        await db.execute(
            select(VaultMember).where(
                VaultMember.vault_id == node_id,
                VaultMember.user_sub == body.user_sub,
            )
        )
    ).scalar_one_or_none()
    # 멱등: 이미 멤버면 wrapped_vault_key 갱신(재공유/권한 변경 시 재호출 허용).
    # 역할(read/write/manage)은 FileShare 가 관리하므로 여기선 키만.
    if exists:
        exists.wrapped_vault_key = body.wrapped_vault_key
        await db.commit()
        await db.refresh(exists)
        return VaultMemberOut(
            user_sub=exists.user_sub, created_at=exists.created_at.isoformat()
        )
    m = VaultMember(
        id=new_node_id(),
        vault_id=node_id,
        user_sub=body.user_sub,
        wrapped_vault_key=body.wrapped_vault_key,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return VaultMemberOut(user_sub=m.user_sub, created_at=m.created_at.isoformat())


@router.delete(
    "/vaults/{node_id}/members/{member_sub}",
    status_code=204,
    summary="멤버 제거 (접근 철회): 멤버만 가능",
)
async def remove_vault_member(
    node_id: str,
    member_sub: str,
    user: UserContext = Depends(get_current_user),
    _: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> None:
    """철회는 신규 접근만 차단: 이미 받아간 평문/키는 회수 불가 (ADR-0016 결정 4)."""
    await _require_member(db, node_id, user.sub)
    target = (
        await db.execute(
            select(VaultMember).where(
                VaultMember.vault_id == node_id,
                VaultMember.user_sub == member_sub,
            )
        )
    ).scalar_one_or_none()
    if target:
        await db.delete(target)
        await db.commit()
