"""
UserContext — JWT claims에서 추출한 인증 컨텍스트.

권한 결정은 항상 이 객체를 본다 (DB 조회 안 함).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class UserContext:
    sub: str
    email: str
    name: str | None
    groups: list[str]  # JWT의 groups 클레임 (= 사용자가 속한 회사 ID 목록)
    roles: list[str]   # JWT의 realm_access.roles (System Admin 등)
    sid: str | None    # JWT의 sid (revocation 기준)
    # 원본 access token — 외부 리소스서버(외부 디렉터리 등) 호출 시 그대로 포워딩 (B 모델).
    # 권한 결정엔 안 씀. 기본값 "" (테스트·기존 호출 호환).
    access_token: str = ""
    # 게이트웨이 세션 ID(운영 웹). access_token 이 없을 때 외부 디렉터리 호출을 게이트웨이 경유로 보낸다.
    session_id: str | None = None

    @property
    def has_directory_credential(self) -> bool:
        """외부 디렉터리(부서 조회)를 부를 자격 증명이 있는가. 없으면 그룹 해석을 건너뛴다."""
        return bool(self.access_token or self.session_id)

    @property
    def is_system_admin(self) -> bool:
        return "admin" in self.roles

    def is_member_of(self, company_id: str) -> bool:
        return company_id in self.groups
