# 운영 배포

앞단 리버스 프록시(다른 기계)가 TLS 를 받고 앱 서버의 LAN 포트로 넘긴다. 앱 서버에는 저장소 키를 두지 않고, 로컬에서 `git archive HEAD` 로 올린 뒤 서버의 `scripts/prod.sh` 가 docker compose(`docker-compose.prod.yml`)로 빌드하고 띄운다. 계정 서버(ashfield-account)를 먼저 배포한다.

| 항목 | 값 |
|---|---|
| 서버 | ssh 별칭 `ovm` (`DEPLOY_HOST`), 디렉터리 `~/ashfield/drive` (`DEPLOY_DIR`) |
| 공개 주소 | `https://drive.ashfieldlab.dev` (= `BETTER_AUTH_URL`, 계정 서버 `DRIVE_URL`) |
| 계정 서버 | `https://account.ashfieldlab.dev` (`ACCOUNT_URL`), client secret 은 서버의 `~/ashfield/account/.secrets/clients.local.json` |
| 파일 주소 | `https://drive.ashfieldlab.dev/_minio` (`S3_PUBLIC_ENDPOINT_URL`, 같은 origin 이라 CORS 불필요) |
| 서버에만 있는 것 | `.env.prod`, `backups/` (업로드 때 지우지 않음) |

## 포트와 프록시

| 서버 포트 | 서비스 | 프록시 경로 |
|---|---|---|
| `3200` | frontend (Next.js, BFF) | 나머지 전부 |
| `3201` | MinIO S3 API | `/_minio/*`: 접두사를 떼고 `Host: minio:9000` 으로 (presigned 서명 host). 필수: frontend 의 대비 rewrite 는 10MB 까지만 |
| `127.0.0.1:3202` | MinIO 콘솔 | 열지 않음. `ssh -L 3202:127.0.0.1:3202 ovm` |
| 없음 | backend, worker, postgres, redis | 내부 네트워크만 (backend 는 BFF 만 부른다) |

버킷은 backend 가 부팅 때 만든다 (`ensure_bucket`).

## 업로드 크기

브라우저가 presigned URL 로 MinIO 에 바로 올린다 (앱 서버를 거치지 않음).

| 파일 크기 | 방식 | 요청 하나의 크기 |
|---|---|---|
| `MULTIPART_THRESHOLD_BYTES` (50MiB) 미만 | 단일 PUT | 최대 50MiB |
| 그 이상 | multipart, 파트마다 PUT | `MULTIPART_PART_SIZE_BYTES` (8MiB) |

Cloudflare 프록시의 요청당 100MB 제한 안이다. 두 값을 바꾼다면 100MB 보다 작게.

## 명령 (로컬)

| 명령 | 하는 일 |
|---|---|
| `make deploy-init ADMIN_EMAIL=me@example.com` | 처음 한 번. 올리고 `.env.prod` 생성. DB 비밀번호, S3 키, `BETTER_AUTH_SECRET`, `SMTP_ENCRYPTION_KEY` 는 서버에서 openssl 로, `ASHFIELD_CLIENT_SECRET` 은 계정 서버 파일에서. 출력하지 않는다. `ADMIN_EMAIL` 은 `SYSTEM_ADMIN_EMAILS` 로 |
| `make deploy` | 올리기, 이미지 빌드, Alembic, Better Auth 마이그레이션, 재시작 |
| `make deploy-ps`, `deploy-logs`, `deploy-backup` | 상태, 로그, Postgres 덤프(서버 `backups/`). MinIO 데이터(볼륨 `miniodata`)는 따로 백업 |

커밋하지 않은 변경은 올라가지 않는다. 메일 발송은 `SMTP_ENABLED=false` (보내지 않고 로그만).
