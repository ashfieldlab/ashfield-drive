# 스토리지: S3-compatible + presigned URL 다이렉트 업·다운로드

파일 바이트는 S3-compatible object storage에 저장한다. 개발은 docker-compose로 띄운 MinIO, 운영은 S3-compatible storage. 코드 변경 없음 — endpoint·credential·bucket env 차이만.

업·다운로드는 **클라이언트가 S3와 직접 통신** — 백엔드는 presigned URL만 발급. 백엔드 대역폭 부하 0, 큰 파일에 강함.

**Presigned URL 만료 (짧게)**:
- Upload (단일 PUT): 60초
- Multipart upload part: 5분 (Phase 1.5에 도입)
- Download (단일 GET): 30초

만료는 발급 즉시 사용을 가정. 실패 시 클라이언트가 같은 endpoint에 다시 요청해 새 URL 받음. 노출 위험 최소화.

**Bucket·Key 컨벤션**: 환경별 bucket 1개, key는 `{company_id}/{file_uuid}` flat. 폴더 path 안 박음 — 폴더 rename·이동 시 S3 작업 0. 파일 메타데이터는 모두 DB.

**라이브러리**: aioboto3 (boto3 wrap async). MinIO/AWS 등 S3 호환 스토리지 모두 endpoint_url 파라미터로 동일 코드 동작.

**미완료 cleanup**: 백엔드가 file row 생성 후 status='pending' → 클라이언트 PUT 완료 콜백 시 'ready'. 1시간 이상 pending인 row + S3 객체 cron으로 삭제.
