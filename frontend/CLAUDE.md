# Frontend 규칙 (Next.js 16 · Better Auth = Ashfield 계정 서버 클라이언트)

루트 공통 규칙은 [`../CLAUDE.md`](../CLAUDE.md), spec은 [`../SPEC.md`](../SPEC.md) §2 참조.

## 인증·세션 (Ashfield 계정 서버 SSO: ADR-0024)

- **Better Auth 서버 설정은 `lib/auth/server.ts` 한 곳** (핸들러 `app/api/auth/[...all]/route.ts`). Better Auth CLI 가 이 파일을 직접 읽으므로 `@/` 별칭·`server-only` 를 쓰지 않는다. 테이블은 Postgres 스키마 `auth`: `make auth-migrate`.
  - provider 는 `genericOAuth` 의 `ashfield` 하나 (계정 서버 OIDC). 디스커버리·PKCE·`client_secret_basic`, 모든 토큰 요청에 `resource=${BETTER_AUTH_URL}` (없으면 JWT 가 안 나온다). 소셜 로그인·이메일 비밀번호·허용 이메일은 **앱에 두지 않는다**: 계정 서버 몫.
  - 앱 코드는 `getAuth()` 로 인스턴스를 얻는다 (기동 때 디스커버리 실패 시 재생성). `auth` export 는 CLI 용.
- **BFF → 백엔드 자격 증명은 `lib/auth/session.ts` 의 `resolveBackendAuth()`**: `account` 테이블의 계정 서버 액세스 토큰을 `Authorization: Bearer` 로. 만료 60초 전 refresh(계정당 single-flight: refresh_token 재사용 감지 때문), 실패하면 `reauth` → BFF 가 세션을 지우고 401. 브라우저 JS 엔 토큰이 없다.
- **신원은 `useAppContext()`** 로만 (내부적으로 `/api/v1/me`). Better Auth `useSession` 으로 앱 신원·워크스페이스·권한을 판단하지 말 것.
- **`X-Forwarded-User`/`-Email` 를 보안 판단에 쓰지 말 것**: 권위는 백엔드가 검증한 JWT. 표시 신원도 `/me` 에서.
- 페이지 가드 = `proxy.ts`(세션 쿠키 존재만, 복귀 주소 보존) + `(protected)/layout.tsx`(서버에서 세션 유효성 재확인). 로그아웃 = `lib/actions/auth.ts` 의 `signOutAction()`(refresh 폐기 → 세션 삭제 → 계정 서버 end-session URL) 이 돌려준 주소로 `window.location` 이동.
- 외부 Bearer(데스크톱 클라이언트가 계정 서버에서 받은 토큰)는 BFF 가 그대로 통과시킨다.
- 세션 쿠키 이름은 `AUTH_COOKIE_PREFIX`(앱 이름): 같은 localhost 의 다른 앱·계정 서버와 섞이지 않게.
- 워크스페이스 멤버 관리 UI 는 없다: 계정 서버 `${ACCOUNT_URL}/workspaces/{account_workspace_id}` 링크.
- E2E 는 실제 계정 서버로 로그인한다 (`e2e/auth.ts`, 앱 고유 값은 `e2e/env.ts`). `e2e/auth.ts`·`e2e/token-refresh.spec.ts`·`e2e/global-setup.ts`·`playwright.config.ts`·`lib/auth/*` 는 Calendar 와 바이트 동일하게 유지.

## API 호출

- **클라이언트 컴포넌트**: `lib/api-client.ts`의 `api<T>(path, opts)` (same-origin BFF → 쿠키를 자격 증명 헤더로 변환).
- 서버 컴포넌트에서 백엔드 호출이 필요하면 `resolveBackendAuth(await headers())` 로 헤더를 만들어 호출하는 헬퍼를 새로 작성.
- **SWR 훅**: `lib/hooks/use-api.ts`의 `useApiGet<T>` + `invalidateApi(prefix)`. `useSWR` 직접 호출 금지.
- `X-Active-Workspace-Id` 헤더는 `api-client`가 자동 첨부: 수동 추가 금지.
- `fetch` 직접 호출 금지 (단, 외부 API 호출은 OK: 주석으로 사유 명시).

## 멀티테넌트 + 권한

- 활성 워크스페이스는 `AppContext.activeWorkspaceId` 단일 source of truth. 다른 곳에 또 저장 금지.
- System Admin 체크는 `useAppContext().isSystemAdmin`: 직접 `session.user.roles.includes("admin")` 금지.
- 활성 워크스페이스 admin 체크는 `useAppContext().isWorkspaceAdmin`: System Admin 은 자동 true (ADR-0010).
- 사용자가 워크스페이스 ≥ 2일 때만 `WorkspaceSwitcher`가 dropdown 표시. 임시 selector는 헤더: 공통 헤더로 옮길 때 제거.

## 테스트 선택자 (data-testid)

**모든 interactive 요소에 `data-testid` 필수.**

| 요소 | 부여 |
|------|------|
| `<button>`, `<Button>` | 필수 |
| `<input>`, `<select>`, `<textarea>` | 필수 |
| `<a>` / `<Link>` (탐색용) | 필수 |
| Modal/Dialog trigger + 본체 | 필수 |
| 의미 있는 list/table 컨테이너 | 권장 |
| 아이콘만, 구분선 (decorative) | X |

**Naming**: `{feature}-{element}[-{action|id}]` (kebab-case)
```tsx
<Button data-testid="items-create-button">생성</Button>
<input data-testid="items-form-name-input" />
<tr data-testid={`items-row-${item.id}`}>
<button data-testid={`items-row-${item.id}-delete-button`}>삭제</button>
<div data-testid="items-list">
```

ESLint custom rule이 부여 누락을 warning으로 검출 (`make lint`).

## 로깅

- **`console.log` 금지.** `lib/utils/logger.ts`의 `logger.{debug|info|warn|error}` 사용.
- 카테고리 4종: `auth | api | biz | ui`. 매 호출 `category` 필수.
```ts
logger.info("item_created", { category: "biz", id: item.id })
```
- `NEXT_PUBLIC_LOG_CATEGORIES`로 debug 출력 제어 (`auth,api` 또는 `*`).
- 운영(NODE_ENV=production)은 error만 콘솔 출력.

## 컴포넌트 위치 규칙

```
components/
├── ui/             ← shadcn/ui base (직접 수정 OK)
├── ui-custom/      ← 앱 전용 wrapper (app-frame, user-menu, app-icon, use-toast, use-confirm, error-page, loading-bar)
├── shared/         ← 도메인 중립 (Card, EmptyState 등)
├── layout/         ← app shell (header, sidebar, footer)
├── providers/      ← Context provider만
├── auth/           ← 인증 UI (user-menu, sign-out-button)
└── {feature}/      ← 도메인 컴포넌트 (items, admin 등)
```

새 도메인 추가 시 `components/{feature}/` 폴더 생성. 도메인 컴포넌트를 `shared/`나 `ui/`에 두지 말 것.

## 상태 관리

- **전역 상태는 `AppContext`만.** 새 Context provider 추가는 ADR 필요.
  - 예외: `components/providers/theme-provider.tsx` (next-themes 라이브러리 provider, 테마 선택만 다룸, 값은 localStorage `theme`). 읽기·변경은 `useTheme()`, UI 는 사용자 메뉴의 `ThemeSubmenu`.
- 페이지 간 공유 안 되는 상태는 `useState` / `useReducer` (URL/쿠키도 OK).
- 폼 상태는 일단 native React state. 폼 복잡도 증가하면 react-hook-form 검토 (지금은 미도입).

## Toast 사용

- `const { toast } = useToast()` (`components/ui-custom/use-toast.ts`) → `toast.success | error | info | warning(msg)`.
- 구현은 sonner (shadcn `components/ui/sonner.tsx` 의 `<Toaster />` 를 root layout 에 1회 마운트).
- 성공/실패 즉시 피드백에만. 영구 메시지는 SystemErrorBanner (자동 처리).
- 확인창은 `useConfirm()` (`components/ui-custom/use-confirm.tsx`, shadcn AlertDialog).
- 테마 토큰(브랜드 primary `#3f4a3c`, 다크 `.dark`)은 `app/theme.css`. 색은 토큰(`bg-card`, `text-muted-foreground`, `border-input` 등)으로: `bg-white`·`text-gray-*` 같은 고정색 금지, 상태색(rose·amber 등)은 `dark:` 짝을 같이. shadcn 컴포넌트 추가는 `npx shadcn@latest add <name>` (style `radix-nova`).

## 환경 변수

- `process.env.*` 직접 읽기 금지. `lib/env.ts`의 `env` 객체 사용.
- 새 환경변수 추가 시:
  1. `frontend/.env.example`에 키 + 주석 추가
  2. `lib/env.ts`에 readonly accessor 추가
  3. 사용처는 항상 `env.foo`로 import
