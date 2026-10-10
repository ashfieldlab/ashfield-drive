"""폴더 → zip 변환 — 자손 파일 traverse + 상대 경로 보존.

설계 (Phase 4 v1):
  - 메모리 BytesIO 사용. cap = settings.zip_max_total_bytes / zip_max_files.
  - 권한 ancestor 상속을 신뢰: 폴더에 read 권한이 있으면 자손도 같은 정책 적용 (services/nodes.assert_access).
  - status=pending / deleted_at != NULL 파일은 skip.
  - 빈 폴더는 zip 안에 빈 디렉터리 엔트리로 포함.

미래 개선: stream-zip 로 ChunkedTransfer 스트리밍, 진행률 web socket.
"""

from __future__ import annotations

import io
import zipfile

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import get_object_bytes
from app.models.node import Node

_DESCENDANTS_SQL = text(
    """
    WITH RECURSIVE tree AS (
        SELECT id, parent_id, name, kind, storage_key, size_bytes, status, deleted_at,
               name::text AS rel_path, 0 AS depth
        FROM nodes
        WHERE id = :root_id
        UNION ALL
        SELECT n.id, n.parent_id, n.name, n.kind, n.storage_key, n.size_bytes, n.status, n.deleted_at,
               t.rel_path || '/' || n.name, t.depth + 1
        FROM nodes n
        JOIN tree t ON n.parent_id = t.id
        WHERE t.depth < 64
    )
    SELECT id, name, kind, storage_key, COALESCE(size_bytes, 0) AS size_bytes,
           status, deleted_at, rel_path
    FROM tree
    ORDER BY rel_path
    """
)


async def build_folder_zip(db: AsyncSession, *, root: Node) -> bytes:
    if root.kind != "folder":
        raise HTTPException(400, "Not a folder")

    rows = (await db.execute(_DESCENDANTS_SQL, {"root_id": root.id})).all()

    # 루트 자신은 zip 내 prefix — 자손 rel_path 는 'root/sub/...'
    files: list[tuple[str, str, int]] = []  # (rel_path, storage_key, size)
    folders: list[str] = []
    total = 0
    for row in rows:
        rel_path = row.rel_path
        if row.deleted_at is not None:
            continue
        if row.id == root.id:
            continue  # 루트 자체는 zip 내 디렉터리로 만들지 않음 (prefix 만 떼냄)
        # 자손의 rel_path 는 'root_name/...' 형태 → root_name/ 떼고 저장
        prefix = root.name + "/"
        if rel_path.startswith(prefix):
            rel_path = rel_path[len(prefix) :]
        if row.kind == "folder":
            folders.append(rel_path + "/")
            continue
        if row.status != "ready" or not row.storage_key:
            continue
        files.append((rel_path, row.storage_key, int(row.size_bytes)))
        total += int(row.size_bytes)
        if total > settings.zip_max_total_bytes:
            raise HTTPException(413, "Folder too large to zip")
        if len(files) > settings.zip_max_files:
            raise HTTPException(413, "Too many files to zip")

    if not files and not folders:
        # 빈 폴더 — 그래도 zip 1개는 반환
        pass

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for d in folders:
            # 빈 디렉터리 엔트리
            zf.writestr(zipfile.ZipInfo(d), b"")
        for rel_path, storage_key, _size in files:
            data = await get_object_bytes(storage_key)
            zf.writestr(rel_path, data)
    return buffer.getvalue()
