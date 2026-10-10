# 모노레포 구조: frontend/ + backend/

스켈레톤은 단일 레포에 `frontend/`(Next.js)와 `backend/`(FastAPI) 두 디렉터리를 대칭으로 둔다. 한 사람이 프론트와 백엔드를 함께 작업하는 경우가 대부분이라 PR·이슈가 자연스럽게 두 스택을 묶고, JWT 계약·헤더 규약 같은 인터페이스를 한 곳에서 진화시키는 게 쉽다.

프론트가 루트, 백엔드가 서브디렉터리인 비대칭 구조는 보통 Next.js 단독으로 시작했다 백엔드를 추가한 진화의 흔적이다. 스켈레톤은 처음부터 정할 수 있으므로 두 스택을 대등하게 두고 루트는 공통 자산(CONTEXT.md, docs/adr/, README, Makefile, docker-compose.yml)만 둔다.
