"""Ashfield Drive Backend: FastAPI entry point.

SPEC §3 참조. 인증 흐름 + /me + /nodes + /audit.
"""

from contextlib import asynccontextmanager

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI

from app.api.external import router as external_router
from app.api.router import api_router
from app.core.logging import logger, setup_logging
from app.core.redis import close_redis
from app.core.storage import ensure_bucket
from app.middleware.error_handler import register_error_handlers
from app.middleware.request_id import RequestIdMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    logger.info("backend_starting", extra={"category": "api"})
    try:
        await ensure_bucket()
    except (ClientError, BotoCoreError, OSError) as exc:
        # S3 미가용이어도 부팅은 진행 (인증/메타 API는 동작): 업로드만 실패
        logger.warning(
            "s3_bucket_unreachable_at_boot",
            extra={"category": "storage", "error": str(exc)},
        )
    yield
    await close_redis()
    logger.info("backend_stopped", extra={"category": "api"})


_API_DESCRIPTION = """
ashfield-drive 백엔드: 회사 파일 저장·공유 SaaS.

## 공통 요청 헤더

| 헤더 | 값 | 비고 |
|------|----|------|
| `Authorization` | `Bearer <JWT>` | Better Auth(JWT 플러그인) 발급. `AUTH_JWKS_URL` 로 서명·iss·aud 검증. |
| `X-Active-Company-Id` | 소속 회사 ID 중 하나 | 멀티 테넌트. `/api/v1/me` 의 `groups`. 소속이 아니면 403. |
| `X-Request-ID` | UUID 등 trace id | 로그/응답 헤더에 echo. 없으면 자동 발급. |

## 권한 모델 요약 (ADR-0008)

- **scope=personal**: owner 만 접근. `FileShare` 로 명시적으로 부여하면 grantee 도 접근.
- **scope=shared**: 같은 회사 멤버 모두 접근.
- **공유 상속**: 폴더에 share 가 걸리면 자손도 자동 접근. 재귀 CTE 로 계산.
- **공유 관리**: owner + `permission=manage` 보유자만.

## 표준 응답 코드

| 코드 | 의미 |
|------|------|
| 200 | OK |
| 201 | 생성됨. body 에 새 리소스. |
| 204 | OK, body 없음 |
| 400 | 요청 자체가 잘못됨 (예: 폴더를 자손 아래로 이동) |
| 401 | 인증 실패 (토큰 없음·만료·서명·iss·aud 불일치) |
| 403 | 인증은 됐지만 권한 없음 |
| 404 | 리소스 없음: 다른 회사 리소스도 404 로 마스킹 |
| 409 | 상태 충돌 (예: 업로드 미완료 파일 다운로드 시도) |
| 413 | 페이로드 한도 초과 |
| 422 | 검증 실패 (Pydantic) |

## 외부 (인증 없음) 라우트

`/s/{token}` 계열은 인증 헤더 없이 접근. 토큰 자체가 capability.

자세한 흐름은 [SPEC.md](https://github.com/ashfieldlab/ashfield-drive/blob/main/SPEC.md) 참고.
"""

_TAGS_METADATA = [
    {"name": "auth", "description": "현재 사용자 정보 (첫 호출 시 개인 워크스페이스 생성)."},
    {"name": "nodes", "description": "파일·폴더 트리. 업로드·다운로드는 S3 presigned URL 로 클라이언트 직접 통신."},
    {"name": "notifications", "description": "in-app 알림 목록·읽음 처리·이메일 수신 설정."},
    {"name": "webhooks", "description": "회사 admin 전용. 외부 시스템에 알림 fan-out."},
    {"name": "audit", "description": "관리자 전용. 회사 mutation 감사 로그."},
    {"name": "activity", "description": "본인 관련 변경 타임라인 (audit_logs 중 본인 행동/본인 관련 entity)."},
    {"name": "search", "description": "파일 검색. 권한 모델 그대로 적용."},
    {"name": "company", "description": "회사 멤버 자동완성·멤버 관리."},
    {"name": "external", "description": "공개 토큰 (`/s/{token}`) 으로 접근. 인증 헤더 없음."},
]


app = FastAPI(
    title="Ashfield Drive API",
    version="0.4.0",
    description=_API_DESCRIPTION,
    openapi_tags=_TAGS_METADATA,
    contact={"name": "Ashfield Drive", "url": "https://github.com/ashfieldlab/ashfield-drive"},
    lifespan=lifespan,
)

# 미들웨어 (등록 역순으로 실행: request_id가 가장 먼저)
app.add_middleware(RequestIdMiddleware)

# 글로벌 예외 처리
register_error_handlers(app)

# 라우터
app.include_router(api_router)
app.include_router(external_router)


@app.get("/health", tags=["meta"], summary="헬스 체크")
async def health() -> dict[str, str]:
    """LB/cron 용. 인증 불필요. 항상 `{"status": "ok"}` 반환.

    DB 연결 실패해도 200: DB 의존 핸들러에서 별도 503 응답.
    """
    return {"status": "ok"}
