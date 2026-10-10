"""
UserContext: 인증된 요청의 사용자 컨텍스트.

신원(sub·email·name)은 검증된 JWT 에서, 워크스페이스 소속(groups)·System Admin 여부(roles)는
로컬 DB(users / user_workspace_memberships)에서 온다. 소속은 토큰 `workspaces` 클레임으로
동기화된 캐시다 (ADR-0004, ADR-0024).
권한 결정은 항상 이 객체를 본다.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class UserContext:
    sub: str
    email: str
    name: str | None
    groups: list[str]  # 소속 워크스페이스 ID 목록 (user_workspace_memberships)
    roles: list[str]   # System Admin 이면 ["admin"]

    @property
    def is_system_admin(self) -> bool:
        return "admin" in self.roles

    def is_member_of(self, workspace_id: str) -> bool:
        return workspace_id in self.groups
