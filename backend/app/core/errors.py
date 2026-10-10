"""도메인 비즈니스 에러: 코드 기반 (skeleton 표준).

호출 패턴:
    raise BusinessError("QUOTA_EXCEEDED", status=409,
                        params={"node_id": node.id})

응답 형식:
    {
      "code": "QUOTA_EXCEEDED",
      "message": "...",          # 운영용/fallback 메시지
      "params": {...},           # 클라이언트가 카피 보간에 사용
      "request_id": "..."        # 미들웨어 자동 주입
    }

프론트엔드는 code 로 사용자 친화 카피 lookup (lib/errors.ts). 알 수 없는 code 면
message fallback. params 는 동적 값 (사용량·한도 등) 끼워넣기.

HTTPException 과의 관계: 기존 코드 그대로 동작: 단순 검증 실패는 HTTPException,
도메인 의미 있는 비즈 에러는 BusinessError. 점진적 마이그레이션.
"""


class BusinessError(Exception):
    """도메인 비즈니스 에러: 글로벌 핸들러가 JSON 응답으로 변환."""

    def __init__(
        self,
        code: str,
        *,
        status: int = 400,
        message: str | None = None,
        params: dict | None = None,
    ) -> None:
        self.code = code
        self.status = status
        self.message = message or code
        self.params = params or {}
        super().__init__(self.message)
