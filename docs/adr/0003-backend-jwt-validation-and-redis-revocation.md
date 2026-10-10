# 백엔드는 JWT를 직접 검증하고 Revocation은 Redis sid 캐시로 처리한다

백엔드는 게이트웨이가 풀어준 X-* 헤더를 신뢰하는 패턴 대신 `Authorization: Bearer <JWT>`를 받아 JWKS로 로컬 검증한다(iss / aud / exp / nbf / iat + RS256, JWKS 1시간 캐싱). 이로써 백엔드는 게이트웨이 없이도 단독 검증·테스트가 가능하고, 인증의 source of truth는 Keycloak 하나로 수렴한다.

순수 stateless JWT의 약점인 "로그아웃 즉시 무효화 불가"는 Redis 기반 revocation 캐시로 보완한다. 백엔드가 `/api/v1/auth/backchannel-logout` 엔드포인트로 Keycloak의 logout_token을 받아 `revoked_sid:{sid}`를 짧은 TTL(= access token max lifetime)로 SET 한다. 모든 인증 요청은 JWT 검증 후 해당 sid가 revoked인지 SISMEMBER로 체크한다. 무효화 단위는 `sub`이 아니라 `sid` — 한 세션만 끊고 사용자의 다른 디바이스 세션은 살아 있게 한다.

토큰 introspection을 매 요청 호출하는 대안과 비교해 Keycloak 부하·latency가 훨씬 작고, sub 기반 revocation과 비교해 재로그인 즉시 새 sid로 통과 가능하다.
