"""S3-compatible storage 어댑터 (ADR-0005).

dev: MinIO (S3_ENDPOINT_URL=http://localhost:19000)
prod: S3-compatible storage / AWS S3 등

aioboto3 사용. 업로드/다운로드 presigned URL 발급 + head_object로 업로드 검증.
앱은 객체 본문을 절대 통과시키지 않는다 — 클라이언트 ↔ S3 직접.
"""

from __future__ import annotations

import aioboto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import settings
from app.core.logging import logger

_session: aioboto3.Session | None = None


def _get_session() -> aioboto3.Session:
    global _session
    if _session is None:
        _session = aioboto3.Session()
    return _session


def _client_kwargs() -> dict:
    return {
        "endpoint_url": settings.s3_endpoint_url,
        "aws_access_key_id": settings.s3_access_key,
        "aws_secret_access_key": settings.s3_secret_key,
        "region_name": settings.s3_region,
        "config": Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    }


async def ensure_bucket() -> None:
    """앱 부팅 시 1회: 버킷 없으면 생성 + CORS 적용. dev MinIO 편의용."""
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        try:
            await s3.head_bucket(Bucket=settings.s3_bucket)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code not in ("404", "NoSuchBucket", "NotFound"):
                raise
            await s3.create_bucket(Bucket=settings.s3_bucket)
            logger.info(
                "s3_bucket_created",
                extra={"category": "storage", "bucket": settings.s3_bucket},
            )

        # 브라우저가 presigned URL 로 직접 PUT/GET 하므로 CORS 필수.
        # MinIO 는 PutBucketCors 미지원 — 컨테이너 환경변수 MINIO_API_CORS_ALLOW_ORIGIN 으로 설정.
        # S3-compatible storage 등 진짜 S3 호환 서비스는 PutBucketCors 를 지원하므로 운영에선 별도 적용.


def _rewrite_public(url: str) -> str:
    """presigned URL 의 host 부분을 클라 노출용 endpoint 로 치환. 서명은 그대로 유지.

    dev: localhost:19000 → localhost:{FRONTEND_PORT}/_minio (Next rewrites 가 다시 :19000 으로
    forward → 받는 host header 가 서명 host 와 일치).
    우선순위: S3_PUBLIC_ENDPOINT_URL(명시) > localhost:{FRONTEND_PORT}/_minio(derive).
    """
    pub = settings.s3_public_endpoint_url_resolved
    if not pub:
        return url
    return url.replace(settings.s3_endpoint_url, pub, 1)


async def presign_put(storage_key: str, *, content_type: str | None = None) -> str:
    """단일 PUT presigned URL — TTL = settings.presign_upload_ttl_seconds."""
    session = _get_session()
    params: dict = {"Bucket": settings.s3_bucket, "Key": storage_key}
    if content_type:
        params["ContentType"] = content_type
    async with session.client("s3", **_client_kwargs()) as s3:
        url = await s3.generate_presigned_url(
            "put_object",
            Params=params,
            ExpiresIn=settings.presign_upload_ttl_seconds,
        )
    return _rewrite_public(url)


async def presign_get(
    storage_key: str,
    *,
    download_name: str | None = None,
    inline: bool = False,
) -> str:
    """GET presigned URL.

    download_name 지정 시 ResponseContentDisposition=attachment (브라우저 다운로드).
    inline=True 면 미리보기 — Content-Disposition 미설정 (브라우저 inline 처리) +
    TTL=presign_preview_ttl_seconds. 그 외 = TTL=presign_download_ttl_seconds.
    """
    session = _get_session()
    params: dict = {"Bucket": settings.s3_bucket, "Key": storage_key}
    if download_name and not inline:
        params["ResponseContentDisposition"] = (
            f'attachment; filename="{download_name}"'
        )
    ttl = (
        settings.presign_preview_ttl_seconds
        if inline
        else settings.presign_download_ttl_seconds
    )
    async with session.client("s3", **_client_kwargs()) as s3:
        url = await s3.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=ttl,
        )
    return _rewrite_public(url)


async def head_object(storage_key: str) -> dict | None:
    """객체 존재 + 메타 조회. 없으면 None."""
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        try:
            return await s3.head_object(Bucket=settings.s3_bucket, Key=storage_key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in ("404", "NoSuchKey", "NotFound"):
                return None
            raise


async def delete_object(storage_key: str) -> None:
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        await s3.delete_object(Bucket=settings.s3_bucket, Key=storage_key)


async def get_object_bytes(storage_key: str) -> bytes:
    """객체 본문을 메모리로 읽음. zip export 등 서버측 통과 시 사용."""
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        r = await s3.get_object(Bucket=settings.s3_bucket, Key=storage_key)
        return await r["Body"].read()


# ---------------------------------------------------------------------------
# Multipart upload — 50MB+ 파일용 (S3 표준 흐름)
# ---------------------------------------------------------------------------


async def create_multipart_upload(
    storage_key: str, *, content_type: str | None = None
) -> str:
    """CreateMultipartUpload — UploadId 반환."""
    session = _get_session()
    params: dict = {"Bucket": settings.s3_bucket, "Key": storage_key}
    if content_type:
        params["ContentType"] = content_type
    async with session.client("s3", **_client_kwargs()) as s3:
        r = await s3.create_multipart_upload(**params)
    return r["UploadId"]


async def presign_upload_part(
    storage_key: str, *, upload_id: str, part_number: int
) -> str:
    session = _get_session()
    params = {
        "Bucket": settings.s3_bucket,
        "Key": storage_key,
        "UploadId": upload_id,
        "PartNumber": part_number,
    }
    async with session.client("s3", **_client_kwargs()) as s3:
        url = await s3.generate_presigned_url(
            "upload_part",
            Params=params,
            ExpiresIn=settings.presign_upload_ttl_seconds,
        )
    return _rewrite_public(url)


async def complete_multipart_upload(
    storage_key: str,
    *,
    upload_id: str,
    parts: list[dict],  # [{"PartNumber": int, "ETag": str}, ...]
) -> dict:
    """CompleteMultipartUpload — 응답 dict (Location/ETag 등) 반환."""
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        return await s3.complete_multipart_upload(
            Bucket=settings.s3_bucket,
            Key=storage_key,
            UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )


async def abort_multipart_upload(storage_key: str, *, upload_id: str) -> None:
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        await s3.abort_multipart_upload(
            Bucket=settings.s3_bucket, Key=storage_key, UploadId=upload_id
        )
