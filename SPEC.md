# Ashfield Drive — Implementation Spec

이 문서는 Ashfield Drive 의 구현 spec — 초기 스켈레톤에서 상속된 기반(§1~§8) + 도메인 모델(§9~).

> 참고: §1~§8 은 초기 스켈레톤 시점의 기록이라 현재 코드와 다른 부분이 있다 (인증은 ADR-0021, UI 는 shadcn/ui 기반 로컬 컴포넌트).
도메인 용어는 [CONTEXT.md](CONTEXT.md), 핵심 아키텍처 결정은 [docs/adr/](docs/adr/) 참조.

---

## 0. Scope

**대상**: 멀티테넌트 파일 저장·공유 SaaS. Nextcloud self-host 대체. (일정은 별도 레포 ashfield-calendar.)
**기반**: 초기 스켈레톤 (NextAuth + JWT 다이렉트 + Multi-tenant + Redis revocation).
**외부 시스템 의존** (ADR-0009): Keycloak(인증), S3-compatible storage(스토리지), 외부 admin 도구(회원·회사 관리).
**원칙**: JWT만 신뢰. 회원가입·회사관리·빌링 자체 구현 없음.

> §1~§8은 스켈레톤에서 상속된 기반 spec (참조용 — Item 예제는 무시).
> §9부터가 Ashfield Drive 본 도메인 모델.

---

## 1. 디렉터리 구조

```
ashfield-drive/
├── CLAUDE.md                      ← 모노레포 공통 규칙 (커밋·도메인 언어 포인터)
├── CONTEXT.md                     ← 도메인 용어 정의
├── SPEC.md                        ← 본 문서
├── README.md                      ← 빠른 시작 가이드
├── Makefile                       ← 모든 명령 통일
├── docker-compose.yml             ← redis + postgres (인프라만)
├── .env.example                   ← 모든 환경변수 예시
├── docs/
│   └── adr/                       ← 아키텍처 결정 기록
├── dev-keys/                      ← SKIP_AUTH용 RSA 키 페어 (commit)
│   ├── private.pem
│   └── public.pem
├── frontend/                      ← Next.js 16
│   ├── CLAUDE.md
│   ├── package.json
│   ├── next.config.ts
│   ├── auth.ts                    ← NextAuth v5 config
│   ├── proxy.ts                   ← 인증 가드
│   ├── playwright.config.ts
│   ├── vitest.config.ts
│   ├── Dockerfile
│   ├── .storybook/
│   ├── app/
│   │   ├── layout.tsx             ← Pretendard 폰트, AppContext provider
│   │   ├── page.tsx               ← 홈 (로그인 후 /items 리다이렉트)
│   │   ├── error.tsx              ← 글로벌 에러 바운더리
│   │   ├── not-found.tsx          ← 404
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx     ← 즉시 IDP 리다이렉트 (UI 없음)
│   │   │   └── login/auto-login.tsx
│   │   ├── (protected)/
│   │   │   ├── layout.tsx         ← getSession 검증
│   │   │   ├── items/
│   │   │   │   ├── page.tsx       ← 리스트 + 생성 폼 (RBAC 예제)
│   │   │   │   └── [id]/page.tsx  ← 상세
│   │   │   └── admin/
│   │   │       └── page.tsx       ← System admin 전용
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       └── auth/federated-logout/route.ts
│   ├── components/
│   │   ├── providers/
│   │   │   ├── app-context.tsx
│   │   │   ├── swr-error-bridge.tsx
│   │   │   └── connection-status.tsx
│   │   ├── shared/                ← 도메인 중립 컴포넌트
│   │   ├── ui/                    ← shadcn/ui base
│   │   ├── ui-custom/             ← toast, error-page, loading-bar
│   │   └── items/                 ← 예제 도메인 컴포넌트
│   ├── lib/
│   │   ├── api.ts                 ← 서버 사이드 fetch
│   │   ├── api-client.ts          ← 클라이언트 사이드 fetch
│   │   ├── env.ts
│   │   ├── session.ts
│   │   ├── dev-jwt.ts             ← SKIP_AUTH 모드 JWT 발급
│   │   ├── constants/
│   │   ├── types/
│   │   ├── hooks/
│   │   │   ├── use-api.ts         ← useApiGet, invalidateApi
│   │   │   └── use-auth.ts
│   │   └── utils/
│   │       └── logger.ts          ← 카테고리 로거
│   ├── e2e/                       ← Playwright
│   │   ├── fixtures.ts
│   │   └── items.spec.ts
│   └── public/
└── backend/                       ← FastAPI
    ├── CLAUDE.md
    ├── pyproject.toml
    ├── alembic.ini
    ├── Dockerfile
    ├── start-dev.sh
    ├── alembic/
    │   ├── env.py
    │   └── versions/
    │       └── 0001_initial.py    ← users, companies, items
    ├── app/
    │   ├── main.py                ← FastAPI 앱, 미들웨어, exception handler
    │   ├── core/
    │   │   ├── config.py          ← pydantic-settings
    │   │   ├── logging.py         ← 카테고리 로거 (auth/authz/api/db/cache/biz)
    │   │   ├── redis.py
    │   │   └── db.py              ← SQLAlchemy 2.0 async session
    │   ├── auth/
    │   │   ├── jwks.py            ← JWKS 캐싱 + dev 키 머지
    │   │   ├── validator.py       ← JWT 검증
    │   │   ├── revocation.py      ← Redis revoked_sid
    │   │   ├── backchannel.py     ← /auth/backchannel-logout 엔드포인트
    │   │   ├── context.py         ← UserContext
    │   │   └── dependencies.py    ← get_current_user, require_active_company, require_admin
    │   ├── cache/
    │   │   └── user_sync.py       ← lazy upsert (Redis SETNX throttle)
    │   ├── models/
    │   │   ├── user.py            ← users 테이블 (캐시)
    │   │   ├── company.py         ← companies 테이블 (캐시)
    │   │   └── item.py            ← 예제 도메인 모델
    │   ├── schemas/
    │   │   ├── user.py
    │   │   ├── company.py
    │   │   └── item.py
    │   ├── api/
    │   │   ├── router.py
    │   │   └── v1/
    │   │       ├── me.py
    │   │       ├── items.py
    │   │       ├── admin.py
    │   │       └── auth.py
    │   └── middleware/
    │       ├── request_id.py
    │       └── error_handler.py
    └── tests/
        ├── conftest.py            ← async test DB + create_test_jwt helper
        ├── test_items.py
        └── test_admin.py
```

---

## 2. Frontend Spec

### 2.1 NextAuth (`frontend/auth.ts`)

```typescript
import NextAuth from "next-auth"
import Keycloak from "next-auth/providers/keycloak"
import Credentials from "next-auth/providers/credentials"
import { signDevJwt, DEV_USERS } from "@/lib/dev-jwt"

const SKIP_AUTH = process.env.NEXT_PUBLIC_SKIP_AUTH === "true"

if (process.env.NODE_ENV === "production" && SKIP_AUTH) {
  throw new Error("SKIP_AUTH cannot be enabled in production")
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID!,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
    }),
    ...(SKIP_AUTH ? [
      Credentials({
        name: "Dev",
        credentials: { username: { label: "Test User" } },
        authorize: async ({ username }) =>
          DEV_USERS[username as string] ?? null,
      })
    ] : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "credentials" && user) {
        token.accessToken = await signDevJwt({
          sub: user.id!,
          email: user.email!,
          name: user.name ?? undefined,
          groups: (user as any).companies ?? [],
          roles: (user as any).roles ?? [],
        })
        token.idToken = token.accessToken  // 같은 토큰으로 logout id_token_hint
      } else if (account?.access_token) {
        token.accessToken = account.access_token
        token.idToken = account.id_token
      }
      return token
    },
    async session({ session, token }) {
      ;(session as any).accessToken = token.accessToken
      return session
    },
  },
  pages: {
    signIn: "/login",  // /login은 즉시 Keycloak 또는 dev provider로 리다이렉트
  },
})
```

### 2.2 즉시 IDP 리다이렉트 (`app/(auth)/login/page.tsx`)

```typescript
// 자체 로그인 화면 없음. 진입 즉시 Keycloak으로.
import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import AutoLogin from "./auto-login"

export default function LoginPage() {
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === "true") {
    return <AutoLogin />  // dev 사용자 선택 화면 (SKIP_AUTH 전용)
  }
  // 운영: 즉시 Keycloak 리다이렉트
  redirect("/api/auth/signin/keycloak")
}
```

### 2.3 API Client (`lib/api-client.ts`)

```typescript
// 핵심 책임:
//   - 자동 타임아웃 (NEXT_PUBLIC_API_TIMEOUT_MS)
//   - X-Active-Company-Id 자동 첨부 (AppContext에서 읽음)
//   - 401 핸들러 → NextAuth signOut + /login 리다이렉트
//   - 활성 요청 카운팅 (전역 로딩바)
//   - request_id 로깅

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public requestId?: string,
    public details?: unknown,
  ) { super(message) }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T>
export async function apiUploadFile<T>(path: string, file: File): Promise<T>
export function subscribeActiveRequests(cb: (count: number) => void): () => void
```

### 2.4 SWR 훅 (`lib/hooks/use-api.ts`)

```typescript
export function useApiGet<T>(path: string | null, swr?: SWRConfiguration<T>): {
  data: T | undefined
  error: ApiError | undefined
  isLoading: boolean
  mutate: () => Promise<T | undefined>
}

export function invalidateApi(prefix: string): void  // SWR cache 전체 무효화
```

### 2.5 AppContext (`components/providers/app-context.tsx`)

```typescript
interface AppContextType {
  authUser: AuthUser | null
  bootstrapped: boolean
  
  companies: string[]                       // JWT의 groups
  activeCompanyId: string | null
  setActiveCompany: (id: string) => void    // 쿠키 저장
  
  isSystemAdmin: boolean                    // JWT realm_access.roles에 "admin"
}
```

부트스트랩:
1. useSession()으로 JWT 추출
2. JWT의 groups → companies
3. 쿠키 `active_company` 확인 → companies에 포함되면 활성, 아니면 companies[0]
4. bootstrapped = true → 자식 렌더 시작

### 2.6 SWR 에러 브릿지 (`components/providers/swr-error-bridge.tsx`)

| 상태 | 처리 |
|------|------|
| 0 또는 5xx | 상단 배너 (persistent) |
| 401 | `signOut()` + `/login` 리다이렉트 |
| 403 | 토스트 |
| 기타 4xx | 토스트 |
| 성공 시 | 배너 자동 해제 |

부트스트랩 중에는 SWR 일시정지 (`isPaused`).

**Toast 구현**: sonner — `components/ui/sonner.tsx` 의 `<Toaster />` (root layout 1회 마운트) + `components/ui-custom/use-toast.ts` 의 `useToast()` 훅 (4 variants: success/error/info/warning).

**확인창·앱 셸**: `components/ui-custom/use-confirm.tsx` (shadcn AlertDialog), `components/ui-custom/app-frame.tsx` (헤더·사이드바 프레임), `user-menu.tsx`, `app-icon.tsx` — 모두 shadcn/ui 기반 로컬 구현.

### 2.7 로거 (`lib/utils/logger.ts`)

```typescript
type Category = "auth" | "api" | "biz" | "ui"

interface LogContext {
  category: Category
  request_id?: string
  [key: string]: unknown
}

export const logger = {
  debug(msg: string, ctx: LogContext): void
  info(msg: string, ctx: LogContext): void
  warn(msg: string, ctx: LogContext): void
  error(msg: string, ctx: LogContext): void
}

// 환경변수:
//   LOG_CATEGORIES=auth,api  (이 두 카테고리만 debug 출력)
//   LOG_CATEGORIES=*         (전부)
//   미설정: info 이상만
// 
// 포맷:
//   NODE_ENV=development → 컬러 텍스트
//   production → JSON
```

### 2.8 컴포넌트 구조

- `components/ui/` — shadcn/ui base. 직접 수정 가능
- `components/ui-custom/` — toast, error-page, loading-bar 등 앱 전용 wrapper
- `components/shared/` — 도메인 중립 (Card, EmptyState 등)
- `components/{feature}/` — 도메인 컴포넌트 (예: `components/items/`)
- `components/providers/` — Context provider만

### 2.9 테스트 선택자 컨벤션

모든 interactive 요소에 `data-testid` 필수:
```tsx
<Button data-testid="items-create-button">생성</Button>
<Input data-testid="items-form-name-input" />
<tr data-testid={`items-row-${item.id}`}>...</tr>
<div data-testid="items-list">...</div>
```

Naming: `{feature}-{element}[-{action|id}]`, kebab-case.

ESLint custom rule: Button/Input/Link/Select 컴포넌트에 testid 없으면 warning.

### 2.10 Playwright (`frontend/e2e/`)

- `playwright.config.ts` — webServer 자동 실행 (또는 외부 서버 기대)
- `fixtures.ts` — `loginAs(testUser)` 헬퍼 (dev JWT 쿠키 주입)
- `items.spec.ts` — 로그인 → 생성 → 리스트 확인 → 삭제 happy path
- `admin.spec.ts` — admin 사용자만 admin 페이지 접근 가능

### 2.11 Storybook (`frontend/.storybook/`)

- Vitest 통합 (`storybookTest` plugin)
- 예제 스토리: ErrorPage
- 본격 활용은 프로젝트가 자기 컴포넌트 추가 시

### 2.12 폰트 & UI

```typescript
// app/layout.tsx
import localFont from "next/font/local"

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
})
```

UI 프리미티브는 shadcn/ui (`components.json` style `radix-nova`, `components/ui/`). 디자인 토큰은 `app/theme.css` (neutral + 브랜드 primary `#3f4a3c`).

---

## 3. Backend Spec

### 3.1 의존성 (`backend/pyproject.toml`)

핵심:
- fastapi
- uvicorn[standard]
- sqlalchemy[asyncio]>=2.0
- asyncpg
- alembic
- pydantic-settings
- python-jose[cryptography] — JWT
- redis>=5
- httpx — JWKS fetch

테스트:
- pytest
- pytest-asyncio
- httpx (test client)

### 3.2 Config (`app/core/config.py`)

```python
class Settings(BaseSettings):
    environment: Literal["development", "production"] = "development"
    
    # Database
    database_url: str
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # OIDC
    oidc_issuer: str
    oidc_jwks_url: str
    oidc_audience: str
    access_token_max_lifetime: int = 300  # revocation TTL
    
    # Dev
    skip_auth: bool = False
    dev_public_key_path: str = "/app/dev-keys/public.pem"
    
    # Logging
    log_categories: str = ""  # 빈 문자열=info 이상만
    
    @model_validator(mode="after")
    def check_skip_auth_prod(self):
        if self.environment == "production" and self.skip_auth:
            raise ValueError("SKIP_AUTH cannot be enabled in production")
        return self
```

### 3.3 JWKS 캐시 (`app/auth/jwks.py`)

```python
async def get_jwks() -> list[dict]:
    """JWKS 공개키 목록. Keycloak + (개발 모드 한정) dev 공개키."""
    keys = await _fetch_keycloak_jwks_cached()  # 1시간 캐시
    if settings.skip_auth:
        keys.append(_load_dev_public_key())
    return keys

async def _fetch_keycloak_jwks_cached() -> list[dict]:
    # JWKS endpoint 호출, kid 변경 감지 시에만 캐시 무효화
    # (게이트웨이의 #5 안티패턴은 가져오지 않음 — JWTError 시 무조건 캐시 무효화 X)
    ...
```

### 3.4 JWT 검증 (`app/auth/validator.py`)

```python
async def validate_jwt(token: str) -> dict:
    keys = await get_jwks()
    try:
        return jwt.decode(
            token, keys,
            algorithms=["RS256"],
            audience=settings.oidc_audience,
            # issuer 검증: prod = keycloak issuer, dev = 둘 다 허용
            issuer=_allowed_issuers(),
        )
    except JWTError as e:
        logger.warning("jwt_validation_failed", extra={"category": "auth", "reason": str(e)})
        raise HTTPException(401, "Token validation failed")
```

### 3.5 Revocation (`app/auth/revocation.py`)

```python
async def is_revoked(sid: str) -> bool:
    return await redis.sismember("revoked_sids", sid) > 0
    # 또는 SET key per sid with TTL — 더 단순
    # → 결정: SET key per sid (SETEX), exists 체크. 자동 만료.

async def revoke_sid(sid: str, ttl: int) -> None:
    await redis.set(f"revoked_sid:{sid}", "1", ex=ttl)
```

### 3.6 Back-channel logout (`app/auth/backchannel.py`)

```python
@router.post("/auth/backchannel-logout")
async def backchannel_logout(logout_token: str = Form(...)):
    try:
        claims = await validate_jwt(logout_token)
    except HTTPException:
        return Response(status_code=400)
    
    if BACKCHANNEL_LOGOUT_EVENT not in claims.get("events", {}):
        return Response(status_code=400)
    if "nonce" in claims:  # OIDC spec
        return Response(status_code=400)
    
    sid = claims.get("sid")
    if not sid:
        return Response(status_code=400)
    
    await revoke_sid(sid, settings.access_token_max_lifetime)
    logger.info("backchannel_logout", extra={"category": "auth", "sid": sid})
    return Response(status_code=200)
```

### 3.7 Lazy upsert (`app/cache/user_sync.py`)

```python
async def maybe_sync_user_cache(claims: dict, db: AsyncSession) -> None:
    sub = claims["sub"]
    
    acquired = await redis.set(f"sync:user:{sub}", "1", ex=300, nx=True)
    if not acquired:
        return
    
    await users_repo.upsert(
        db, id=sub, email=claims["email"], name=claims.get("name")
    )
    for group in claims.get("groups", []):
        await companies_repo.upsert(db, id=group, name=group)
```

### 3.8 Dependencies (`app/auth/dependencies.py`)

```python
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="...", auto_error=True)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    claims = await validate_jwt(token)
    
    sid = claims.get("sid")
    if sid and await is_revoked(sid):
        raise HTTPException(401, "Session revoked")
    
    await maybe_sync_user_cache(claims, db)
    
    return UserContext(
        sub=claims["sub"],
        email=claims["email"],
        name=claims.get("name"),
        groups=claims.get("groups", []),
        roles=claims.get("realm_access", {}).get("roles", []),
        sid=sid,
    )

def require_active_company(
    user: UserContext = Depends(get_current_user),
    x_active_company_id: str = Header(..., alias="X-Active-Company-Id"),
) -> str:
    if x_active_company_id not in user.groups:
        raise HTTPException(403, "Not a member of this company")
    return x_active_company_id

def require_admin(user: UserContext = Depends(get_current_user)) -> UserContext:
    if "admin" not in user.roles:
        raise HTTPException(403, "Admin only")
    return user
```

### 3.9 Models

```python
# users (캐시)
class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(primary_key=True)  # sub
    email: Mapped[str]
    name: Mapped[str | None]
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

# companies (캐시)
class Company(Base):
    __tablename__ = "companies"
    id: Mapped[str] = mapped_column(primary_key=True)  # group 값
    name: Mapped[str]
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

# items (예제 도메인)
class Item(Base):
    __tablename__ = "items"
    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str]
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"))
    created_at: Mapped[datetime]
```

### 3.10 Routes 예시

```python
# /api/v1/items.py
@router.get("/items")
async def list_items(
    company: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
):
    return await items_repo.list_by_company(db, company)

@router.post("/items")
async def create_item(
    payload: ItemCreate,
    user: UserContext = Depends(get_current_user),
    company: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
):
    return await items_repo.create(db, name=payload.name, owner_id=user.sub, company_id=company)

@router.delete("/items/{item_id}")
async def delete_item(
    item_id: str,
    user: UserContext = Depends(get_current_user),
    company: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
):
    item = await items_repo.get_in_company(db, item_id, company)
    if not item:
        raise HTTPException(404)
    
    # owner거나 admin만 삭제 가능
    is_admin = "admin" in user.roles
    if item.owner_id != user.sub and not is_admin:
        raise HTTPException(403, "Not your item")
    
    await items_repo.delete(db, item)
```

### 3.11 로깅 (`app/core/logging.py`)

```python
# 카테고리: auth | authz | api | db | cache | biz
# 사용:
#   logger.info("login_success", extra={"category": "auth", "sub": sub})
#   logger.warning("permission_denied", extra={"category": "authz", "path": path})
# 
# request_id는 ContextVar로 자동 주입.
# JSON formatter는 environment=production일 때만.
```

### 3.12 미들웨어

```python
# request_id.py
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    set_request_id_context(request_id)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# error_handler.py — exception_handlers
# - HTTPException → 표준 응답
# - ValidationError → 필드별 detail
# - 나머지 Exception → 500 + request_id 첨부
```

### 3.13 Tests (`backend/tests/`)

```python
# conftest.py
@pytest.fixture
async def db_session() -> AsyncSession:
    # 트랜잭션 시작 → 테스트 끝나면 롤백
    ...

@pytest.fixture
def make_jwt():
    """테스트용 JWT 발급 헬퍼. dev 개인키로 서명."""
    def _make(sub: str, groups: list[str] = ["c1"], roles: list[str] = []) -> str:
        return jwt.encode({...}, dev_private_key, algorithm="RS256",
                         headers={"kid": "dev-key-2026"})
    return _make

# test_items.py — 멀티테넌트 격리, 권한 (owner/admin)
# test_admin.py — admin role required
```

---

## 4. Infrastructure

### 4.1 `docker-compose.yml`

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
  
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ashfield
      POSTGRES_PASSWORD: ashfield_dev
      POSTGRES_DB: ashfield_drive
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ashfield"]

volumes:
  pgdata:
```

→ 앱 컨테이너는 docker-compose에 없음. 호스트에서 실행 (hybrid 워크플로우).

### 4.2 `Makefile`

```makefile
.PHONY: infra backend frontend stop migrate pytest typecheck lint e2e e2e-ui storybook ci-local hooks smoke

infra:
	docker compose up -d redis postgres

backend:
	cd backend && uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

stop:
	docker compose down

migrate:
	cd backend && alembic upgrade head

pytest:
	cd backend && pytest

typecheck:
	cd frontend && npx tsc --noEmit

lint:
	cd frontend && npm run lint
	cd backend && ruff check .

e2e:
	cd frontend && npx playwright test

e2e-ui:
	cd frontend && npx playwright test --ui

storybook:
	cd frontend && npm run storybook

ci-local: typecheck lint pytest e2e
	cd frontend && npm run build

hooks:
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-push

smoke:
	./scripts/smoke.sh
```

### 4.3 Dockerfiles

**`frontend/Dockerfile`** — multi-stage, `output: "standalone"`, SSH mount for github npm packages, 비root.

**`backend/Dockerfile`** — multi-stage, python:3.12-slim, uvicorn, 비root.

### 4.4 `.env.example`

```env
# 환경
NODE_ENV=development
ENVIRONMENT=development

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_TIMEOUT_MS=10000
NEXT_PUBLIC_SKIP_AUTH=true
AUTH_SECRET=run-openssl-rand-base64-32

# Keycloak (운영용 — SKIP_AUTH=true면 무시 가능)
AUTH_KEYCLOAK_ID=
AUTH_KEYCLOAK_SECRET=
AUTH_KEYCLOAK_ISSUER=

# Backend
DATABASE_URL=postgresql+asyncpg://ashfield:ashfield_dev@localhost:5432/ashfield_drive
REDIS_URL=redis://localhost:6379
OIDC_ISSUER=
OIDC_JWKS_URL=
OIDC_AUDIENCE=
SKIP_AUTH=true
DEV_PUBLIC_KEY_PATH=./dev-keys/public.pem
LOG_CATEGORIES=
```

### 4.5 Dev Keys (`dev-keys/`)

- `private.pem` — RS256 개인키 (Frontend에서 dev JWT 서명)
- `public.pem` — 대응 공개키 (Backend에서 검증)
- 둘 다 commit. **개발 전용임을 README에 명시**.
- 생성 명령: `openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem`

### 4.6 Pre-push hook (`.githooks/pre-push`)

```bash
#!/bin/sh
make typecheck lint pytest || exit 1
```

설치: `make hooks`

---

## 5. Conventions

### 5.1 커밋 메시지

한 줄. 한국어 요약 가능.
```
feat(items): 항목 삭제 API 추가
fix(auth): JWT exp 검증 누락 수정
chore(deps): Pretendard 업데이트
```

### 5.2 Alembic

- 직접 수정 금지. fix-forward (새 revision)
- 마이그레이션 명령은 항상 `make migrate`

### 5.3 ESLint custom rule

`eslint-plugin-data-testid` (커스텀 또는 기존 플러그인 활용) — Button/Input/Link/Select에 data-testid 없으면 warning.

### 5.4 testid naming

`{feature}-{element}[-{action|id}]`, kebab-case. 자세한 규칙은 `frontend/CLAUDE.md`.

### 5.5 CLAUDE.md 계층

- 루트: 모노레포 공통 (커밋·브랜치·CI 정책)
- `frontend/CLAUDE.md`: NextAuth·API·testid·로깅 규칙
- `backend/CLAUDE.md`: dependencies·logger·Alembic 규칙

---

## 6. Hello World — 클론 → 동작 확인

```bash
# 1. 클론
git clone <repo> my-new-project && cd my-new-project

# 2. 환경 셋업
cp .env.example .env
# .env에서 AUTH_SECRET만 생성 — `openssl rand -base64 32`로 채움
npm install --prefix frontend
pip install -e backend  # 또는 uv pip install

# 3. 인프라 띄움
make infra

# 4. 마이그레이션
make migrate

# 5. 앱 띄움 (각 터미널)
make backend    # localhost:8000
make frontend   # localhost:3000

# 6. 브라우저
# http://localhost:3000
# → SKIP_AUTH 모드 → dev 사용자 선택 화면
# → 선택 → JWT 발급 → /items
# → 리스트 표시, 생성, 삭제 동작
# → admin 사용자 선택하면 /admin 접근 가능
```

검증 통과 조건:
- [ ] 로그인 후 /items 페이지에서 SWR이 백엔드 호출, 성공
- [ ] /items에서 새 항목 생성 → 즉시 리스트에 반영
- [ ] 다른 회사로 active 전환 → /items 데이터 격리됨
- [ ] admin 사용자만 /admin 접근 가능
- [ ] 로그아웃 → /login → 다시 로그인 흐름 가능
- [ ] Playwright `make e2e` 통과
- [ ] `make pytest` 통과
- [ ] `make ci-local` 통과

---

## 7. Migration Plan — 현재 → 목표

별도 grill 세션에서 결정. 아래는 작업 단위만 미리 식별 (실제 순서·범위는 다음 세션에서 grill):

| # | 작업 | 영향 |
|---|------|------|
| M1 | 게이트웨이 모드 코드 제거 | `lib/session.ts`, `proxy.ts`, `auth.ts`의 gateway 분기 삭제 |
| M2 | 루트 파일들을 `frontend/`로 이동 | 모든 import 경로 영향 없음 (상대 경로 그대로) — Dockerfile, package.json만 경로 갱신 |
| M3 | `backend/` 신규 생성 | FastAPI 골격 + Alembic + 위 모든 spec 코드 |
| M4 | `docker-compose.yml` 추가 | redis + postgres |
| M5 | `Makefile` 추가 | 위 표 |
| M6 | 이전 프로젝트에서 발췌해 옮길 코드 | `lib/api-client.ts`, `lib/api.ts`, `lib/utils/logger.ts`, `app/error.tsx`, `components/ui-custom/*`, `components/providers/*` |
| M7 | Item 예제 구현 | 백엔드 routes + 모델 + 프론트 페이지 + e2e + pytest |
| M8 | Playwright + Storybook 셋업 | `playwright.config.ts`, `.storybook/` |
| M9 | dev-keys 생성 + signDevJwt + DEV_USERS | SKIP_AUTH 동작 |
| M10 | CLAUDE.md 계층 작성 | 위 규칙들 박음 |
| M11 | ESLint custom rule | testid 강제 |
| M12 | README 작성 | Hello World 흐름 명시 |

---

## 8. 결정 사항 색인 (22개)

| # | 항목 | 본 문서 섹션 |
|---|------|------|
| 1 | 프로젝트 정체성 | 0 |
| 2 | NextAuth + JWT 다이렉트 only | 2.1, ADR-0001 |
| 3 | 모노레포 frontend/+backend/ | 1, ADR-0002 |
| 4 | 백엔드 JWT 검증 + Redis revocation | 3.3-3.6, ADR-0003 |
| 5 | sid 기반 back-channel logout | 3.6, ADR-0003 |
| 6 | 로그 카테고리 6/4개 | 2.7, 3.11 |
| 7 | Hybrid 워크플로우 | 4.1, 4.2 |
| 8 | 레벨 2 + admin 예제 | 3.10, 6 |
| 9 | 즉시 IDP 리다이렉트 | 2.2 |
| 10 | 멀티테넌트 JWT groups + X-Active-Company-Id | 2.5, 3.8, ADR-0004 |
| 11 | users/companies 캐시 + lazy upsert (Redis throttle) | 3.7, 3.9, ADR-0004 |
| 12 | UI: shadcn + Pretendard | 2.8, 2.12 |
| 13 | Testing: pytest + Vitest + Playwright + Storybook | 2.10, 2.11, 3.13 |
| 14 | Error: sonner + 글로벌 에러 페이지 + SWR 핸들러 | 2.6, 3.12 |
| 15 | API client 분리 + 자동 X-Active-Company-Id | 2.3 |
| 16 | AppContext 최소형 | 2.5 |
| 17 | CI: Makefile + pre-push + multi-stage Dockerfile | 4.2, 4.3, 4.6 |
| 18 | Playwright 초반 셋업 | 2.10 |
| 19 | testid 컨벤션 | 2.9, 5.4 |
| 20 | CLAUDE.md 모노레포 계층 | 5.5 |
| 21 | ESLint testid 강제 rule | 5.3 |
| 22 | SKIP_AUTH = signed dev JWT | 2.1, 3.3, 4.5 |



---

## 9. Ashfield Drive 도메인 모델

§1~§8은 skeleton에서 상속된 기반. 이 섹션부터가 Ashfield Drive 본 spec.

> 아래 ER 의 calendars·calendar_* 테이블은 일정 앱이 별도 레포(ashfield-calendar)로 분리되기 전 기록이다. 이 레포에는 없다.

### 9.1 ER 다이어그램 (Phase 1 + 1.5)

```
users (cache, ADR-0004)             companies (cache, ADR-0004)
  └── id (sub), email, name           └── id (group), name

nodes (Phase 1) ADR-0006
  ├── id (uuid v7), kind: file|folder, name
  ├── parent_id → nodes (NULL=루트)
  ├── company_id → companies
  ├── owner_id → users (만든 사람·소유자)
  ├── scope: personal|shared
  ├── storage_key (file만), size_bytes, mime
  ├── created_at, updated_at, deleted_at
  └── UNIQUE (parent_id, name, deleted_at)  -- 동일 폴더 동일 이름 금지

file_shares (Phase 1.5) ADR-0008
  ├── id, node_id → nodes
  ├── grantee_sub → users
  ├── permission: read|write|manage
  ├── granted_by_sub, granted_at, expires_at?

external_links (Phase 1.5) ADR-0008
  ├── id, node_id → nodes
  ├── token (URL), expires_at?, password_hash?
  ├── permission: read|write
  ├── access_count, last_accessed_at, created_by_sub, revoked_at?

calendars (Phase 1) — ashfield-calendar 로 이전
  ├── id, company_id, owner_id?
  ├── scope: personal|shared
  ├── source: native|external_ics (Phase 2)
  ├── name, description, color
  ├── visibility_default
  ├── external_ics_url?, external_ics_refresh_at? (Phase 2)

calendar_events (Phase 1)
  ├── id, calendar_id → calendars
  ├── title, description, location
  ├── start_at (UTC), end_at (UTC), all_day, timezone
  ├── rrule (text, RFC 5545)
  ├── recurrence_exceptions (jsonb)
  ├── created_by_sub, created_at, updated_at, deleted_at

user_calendar_preferences (Phase 1)
  └── (user_sub, calendar_id) PK, hidden, color_override

calendar_event_invitations (Phase 1.5)
  ├── id, event_id, invitee_sub
  ├── response: pending|accepted|declined|tentative
  └── responded_at?

audit_logs (Phase 1)
  ├── id, company_id, actor_sub?, actor_type: user|external_link
  ├── action: create|update|delete|restore|share|unshare
  ├── entity_type, entity_id
  ├── meta (jsonb), ip_address?, user_agent?, request_id
  └── created_at
```

### 9.2 권한 체크 (Phase 1)

`require_node_access(node_id, permission='read')` dependency:

```python
async def require_node_access(
    node_id: str,
    permission: Literal['read', 'write'] = 'read',
    user: UserContext = Depends(get_current_user),
    company: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> Node:
    node = await get_node(db, node_id)
    
    # 다른 회사 노드는 존재 자체 마스킹
    if node is None or node.company_id != company:
        raise HTTPException(404)
    
    # Phase 1 규칙
    if node.scope == 'personal' and node.owner_id != user.sub:
        raise HTTPException(403)
    if node.scope == 'shared':
        pass  # active company 멤버면 통과
    
    # Phase 1.5에 FileShare 조회 + ancestor 권한 합산 추가
    return node
```

캘린더는 별도 `require_event_access(event_id)` — `event.calendar.scope` 기반 동일 로직.

### 9.3 스토리지 (ADR-0005)

**환경 설정**:
```
S3_ENDPOINT_URL=http://minio:9000        # dev
                https://s3.example.com             # prod (S3 호환)
S3_BUCKET=workspace-dev | workspace
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_REGION=us-east-1
```

**Key 패턴**: `{company_id}/{file_uuid}` flat. 폴더 path 안 박음.

**업로드 흐름**:
```
1. POST /api/v1/nodes/upload-url
   body: { parent_id, name, size, mime }
   백엔드:
     a. parent_id 접근권한 체크 (require_node_access write)
     b. 동일 폴더 동일 이름 충돌 시 "(2)" 자동 rename
     c. node row INSERT (kind=file, status=pending, storage_key=`{company}/{uuid}`)
     d. presigned PUT URL 발급 (60s 만료, single PUT)
     e. 응답: { node_id, upload_url, expires_at }

2. 클라이언트 → S3 직접 PUT (upload_url, body=파일)

3. POST /api/v1/nodes/{id}/complete
   백엔드:
     a. S3 head_object → 실제 업로드 확인
     b. size·etag 갱신
     c. status: pending → ready
     d. audit_log INSERT (action='create')
     e. 응답: 전체 node row
```

**다운로드 흐름**:
```
1. POST /api/v1/nodes/{id}/download-url
   백엔드:
     a. require_node_access read
     b. presigned GET URL 발급 (30s 만료)
     c. audit_log? — Phase 1엔 read 안 함, Phase 2 옵션
     d. 응답: { url, expires_at }

2. 클라이언트 → S3 직접 GET
   실패(403, URL 만료) 시 1번 재요청해 새 URL.
```

**Multipart upload** (Phase 1.5, 50MB+):
- POST `/upload-url` 응답에 `multipart: true` + `upload_id`
- POST `/{id}/parts/{n}` per-part presigned URL
- POST `/{id}/complete-multipart` → CompleteMultipartUpload

**Cleanup cron** (Phase 1): 1시간 이상 status=pending node row → S3 객체 삭제 + DB row 삭제.

### 9.4 백엔드 API (Phase 1)

```
GET    /api/v1/me                                  (skeleton)
POST   /api/v1/auth/backchannel-logout             (skeleton)

POST   /api/v1/nodes/upload-url                    (file 생성 시작)
POST   /api/v1/nodes/{id}/complete                 (file 업로드 완료)
POST   /api/v1/nodes/{id}/download-url             (file 다운로드 URL)
POST   /api/v1/nodes                               (folder 생성)
GET    /api/v1/nodes/tree?parent_id=&scope=        (자식 목록)
GET    /api/v1/nodes/{id}                          (메타 조회)
PATCH  /api/v1/nodes/{id}                          (rename / move — parent_id, name 수정)
DELETE /api/v1/nodes/{id}                          (soft delete)
POST   /api/v1/nodes/{id}/restore                  (휴지통 복원)

GET    /api/v1/calendars                           (자동 가시 + 본인 personal)
POST   /api/v1/calendars                           (생성)
PATCH  /api/v1/calendars/{id}                      (이름·색 수정)
DELETE /api/v1/calendars/{id}                      (soft delete)
PATCH  /api/v1/calendars/{id}/preferences          (hidden·color_override)

GET    /api/v1/events?from=&to=&calendar_ids=      (범위 내 occurrence 풀어서)
POST   /api/v1/events
GET    /api/v1/events/{id}
PATCH  /api/v1/events/{id}                         (this occurrence vs entire series — 옵션)
DELETE /api/v1/events/{id}?occurrence=             (this occurrence면 exception 추가)

GET    /api/v1/audit?from=&to=&entity_type=        (회사 admin만)
```

**Phase 1.5 추가**:
```
POST   /api/v1/nodes/{id}/shares                   (FileShare 생성)
DELETE /api/v1/nodes/{id}/shares/{share_id}
POST   /api/v1/nodes/{id}/external-links          (ExternalLink 생성)
DELETE /api/v1/nodes/{id}/external-links/{link_id}
GET    /s/{token}                                  (외부 접근 entry — 인증 없음)
POST   /s/{token}/verify-password                  (비밀번호 검증)

POST   /api/v1/events/{id}/invitations             (멤버 초대)
PATCH  /api/v1/events/{id}/invitations/{id}        (응답)
```

### 9.5 프론트엔드 페이지 (Phase 1)

```
/                           → /files 리다이렉트
/files                      파일 트리 (좌측 사이드바 + 메인)
   /files?folder={id}       특정 폴더로 이동
   /files/trash             휴지통
/calendar                   월 뷰 + 좌측 사이드바
/audit                      회사 admin만 (Phase 1 minimum)
/login                      skeleton 그대로 (IDP redirect)
/access-denied              groups 비어있을 때 노출
```

**좌측 사이드바 (전체 공통)**:
- 워크스페이스 selector (skeleton의 CompanySwitcher)
- "파일" / "캘린더" 메뉴

**`/files` 좌측 보조 사이드바**:
- 내 파일 / 회사 공유 / 휴지통

**`/calendar` 좌측 보조 사이드바**:
- 내 캘린더 (체크박스) / 회사 공유 캘린더 (체크박스)
- + 버튼으로 새 캘린더 생성

### 9.6 testid 컨벤션 (skeleton § 2.9 연장)

도메인 testid 예시:
- `files-page` / `files-tree` / `files-row-{id}` / `files-row-{id}-menu-button`
- `files-upload-button` / `files-upload-input` / `files-new-folder-button`
- `files-sidebar-personal` / `files-sidebar-shared` / `files-sidebar-trash`
- `calendar-page` / `calendar-month-view` / `calendar-event-{id}`
- `calendar-sidebar-list` / `calendar-sidebar-checkbox-{calendar_id}`
- `event-form` / `event-form-title-input` / `event-form-save-button`

ESLint custom rule (skeleton ADR) 그대로 적용.

### 9.7 로그 카테고리 적용

skeleton의 6 카테고리 그대로 사용:
- `auth` — JWT 검증, revocation
- `authz` — node 접근 거부, 회사 미멤버
- `api` — 요청·응답 일반
- `db` — 무거운 쿼리·트랜잭션
- `cache` — Redis (revocation, throttle)
- `biz` — 파일·이벤트 CRUD, share·external-link 생성

### 9.8 의존성 추가 (skeleton 위에)

**Backend**:
- `aioboto3` — S3-compatible storage
- `python-dateutil` — RRULE 파싱·expand
- `icalendar` (선택, Phase 2 ICS export)

**Frontend**:
- `rrule` (rrule.js) — 클라이언트측 RRULE 표시
- 캘린더 라이브러리 — Phase 1엔 자체 구현 (Tailwind 월 그리드)

### 9.9 환경 변수 (skeleton에 추가)

```env
# Backend
S3_ENDPOINT_URL=http://minio:9000
S3_BUCKET=workspace-dev
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio_dev_secret
S3_REGION=us-east-1               # MinIO는 임의값
PRESIGN_UPLOAD_TTL_SECONDS=60
PRESIGN_DOWNLOAD_TTL_SECONDS=30

# Frontend
# (없음 — 클라이언트는 S3 endpoint 모름, 매 요청 백엔드에 presigned URL 요청)
```

docker-compose에 MinIO 컨테이너 추가:
```yaml
minio:
  image: minio/minio
  ports:
    - "${MINIO_HOST_PORT:-19000}:9000"
    - "${MINIO_CONSOLE_HOST_PORT:-19001}:9001"
  environment:
    MINIO_ROOT_USER: minio
    MINIO_ROOT_PASSWORD: minio_dev_secret
  command: server /data --console-address ":9001"
  volumes:
    - miniodata:/data
```

### 9.10 Hello World 검증 (Phase 1 종료 시점)

```bash
# 1. 인프라
make infra              # redis + postgres + minio
make migrate            # nodes, calendars, events, etc.

# 2. 앱
make backend
make frontend

# 3. 브라우저 검증
- /login → dev 사용자 선택 (admin)
- /files → "내 파일" 비어 있음
- "새 폴더" 클릭 → "프로젝트" 생성 → 폴더 row 추가
- 그 안에서 파일 upload → S3에 저장 → 리스트 노출
- 파일 다운로드 → 정상
- 휴지통으로 이동 → /files/trash에 노출 → 복원
- /calendar → 월 뷰. 새 이벤트 추가. 표시.
- 다른 dev 사용자(같은 회사)로 재로그인 → shared 캘린더·shared 폴더 자동 보임
```

