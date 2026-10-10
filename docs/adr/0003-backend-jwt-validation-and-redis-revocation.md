# 백엔드는 JWT를 직접 검증한다 (Redis revocation 은 폐기)

백엔드는 프록시가 풀어준 X-* 신원 헤더를 신뢰하는 대신 `Authorization: Bearer <JWT>`를 받아 JWKS로 로컬 검증한다(RS256 + iss / aud / exp / nbf / iat, JWKS 1시간 캐싱, 모르는 kid 면 재조회). 이로써 백엔드는 다른 서비스 없이 단독 검증·테스트가 가능하다. 토큰 발급자는 Better Auth JWT 플러그인이다 (ADR-0023).

## 개정 (2026-10, ADR-0023)

예전에는 Keycloak OIDC back-channel logout(`/api/v1/auth/backchannel-logout`)으로 받은 `sid` 를 Redis `revoked_sid:{sid}` 에 넣어 로그아웃을 즉시 반영했다. Better Auth 로 옮기면서 이 경로는 없앴다:

- Better Auth 는 back-channel logout 을 보내지 않는다. 로그아웃은 세션 삭제이고, BFF 는 세션이 있어야 새 JWT 를 받는다.
- 대신 JWT 수명을 5분으로 짧게 둔다. 로그아웃 후 이미 발급된 토큰이 살아 있는 창은 최대 5분이다.
- 즉시 무효화가 필요해지면 JWT 에 세션 ID 를 넣고 Better Auth 세션 삭제 시 Redis 에 기록하는 방식을 다시 검토한다.
