"""
환경 설정: pydantic-settings.

.env 파일 또는 환경변수에서 로드. SPEC §3.2.
"""

from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # 환경
    environment: Literal["development", "production"] = "development"

    # Database
    database_url: str = "postgresql+asyncpg://ashfield:ashfield_dev@localhost:15532/ashfield_drive"

    # Redis (파일 이벤트 pub/sub 등)
    redis_url: str = "redis://localhost:16479"

    # dev frontend 포트: presigned URL 의 same-origin host derive 에 사용 (BACKEND_PORT 와 동일 패턴).
    frontend_port: int | None = None

    # S3-compatible storage (ADR-0005)
    s3_endpoint_url: str = "http://localhost:19200"
    # presigned URL 응답 시 host 부분 치환: dev 의 same-origin proxy(Next rewrites) 우회용.
    # 비어있으면 frontend_port 기반으로 자동 derive (`localhost:{FRONTEND_PORT}/_minio`).
    # 운영(컨테이너·k8s)에선 명시(예: `https://files.example.com`).
    s3_public_endpoint_url: str = ""

    @property
    def s3_public_endpoint_url_resolved(self) -> str:
        """우선순위: 명시값 > localhost:{frontend_port}/_minio > 미치환(빈 문자열)."""
        if self.s3_public_endpoint_url:
            return self.s3_public_endpoint_url
        if self.frontend_port:
            return f"http://localhost:{self.frontend_port}/_minio"
        return ""
    @property
    def files_base(self) -> str:
        return self.files_base_url

    s3_bucket: str = "workspace-dev"
    s3_access_key: str = "minio"
    s3_secret_key: str = "minio_dev_secret"
    s3_region: str = "us-east-1"
    presign_upload_ttl_seconds: int = 60
    presign_download_ttl_seconds: int = 30
    # 인라인 미리보기용 TTL: 모달 mount 시 발급 즉시 사용.
    # PDF/오피스 뷰어가 Range 재요청을 여러 번 보낼 수 있어 download 보다 짧지만 약간 여유.
    presign_preview_ttl_seconds: int = 30
    # Multipart upload: 이 크기 이상이면 multipart 흐름 강제
    multipart_threshold_bytes: int = 50 * 1024 * 1024
    multipart_part_size_bytes: int = 8 * 1024 * 1024

    # 폴더 zip export
    zip_max_total_bytes: int = 200 * 1024 * 1024
    zip_max_files: int = 500

    # SMTP (Phase 3a-3): dev 에선 비활성. 운영에선 환경변수로 주입.
    smtp_enabled: bool = False
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = False
    smtp_from: str = "noreply@ashfield.local"
    smtp_from_name: str = "Ashfield"
    # 이메일 링크 base URL (운영 예: https://drive.example.com).
    files_base_url: str = "http://localhost:3200"
    # SMTP 비밀번호 등 민감 컬럼 암호화 키: Fernet 32 bytes base64.
    # 분실해도 SMTP 재설정만 하면 복구. 운영은 secret manager 에서 주입.
    smtp_encryption_key: str = ""

    # 휴지통 보관: N일 지난 soft-deleted 노드는 일 1회 cron 으로 자동 비움.
    trash_retention_days: int = 30

    # JobRun 원장 보관: N일 지난 cron 실행 기록은 일 1회 자동 삭제.
    job_run_retention_days: int = 14

    # 인증: Ashfield 계정 서버(OIDC 제공자)가 발급한 액세스 토큰(JWT)을 JWKS 로 검증한다
    # (ADR-0024, 계약: ashfield-account docs/adr/0001). 셋 다 필수: 비어 있으면 인증 요청이 503.
    #   AUTH_JWKS_URL = ${ACCOUNT_URL}/api/auth/jwks
    #   AUTH_ISSUER   = ${ACCOUNT_URL}            (토큰 iss 와 정확히 일치)
    #   AUTH_AUDIENCE = 이 앱의 공개 주소(resource): 토큰 aud(배열)에 포함돼야 한다.
    auth_jwks_url: str = ""
    auth_issuer: str = ""
    auth_audience: str = ""

    # System Admin 이메일 (쉼표 구분). users.is_system_admin 과 OR.
    system_admin_emails: str = ""

    @property
    def system_admin_email_set(self) -> frozenset[str]:
        return _email_set(self.system_admin_emails)

    # 로깅
    log_categories: str = ""  # ""=info만, "auth,api"=특정 카테고리 debug, "*"=전부

    @model_validator(mode="after")
    def _guard_auth_in_production(self) -> Settings:
        if self.environment == "production" and not (
            self.auth_jwks_url and self.auth_issuer and self.auth_audience
        ):
            raise RuntimeError(
                "AUTH_JWKS_URL·AUTH_ISSUER·AUTH_AUDIENCE 는 운영에서 필수입니다 (안전 가드)"
            )
        return self


def _email_set(raw: str) -> frozenset[str]:
    return frozenset(e.strip().lower() for e in raw.split(",") if e.strip())


settings = Settings()
