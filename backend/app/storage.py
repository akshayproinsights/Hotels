import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from app.config import settings
import logging

# Cloudflare R2 is S3-compatible — boto3 works with a custom endpoint_url
r2 = boto3.client(
    "s3",
    endpoint_url=settings.r2_endpoint,
    aws_access_key_id=settings.r2_access_key,
    aws_secret_access_key=settings.r2_secret_key,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)


def generate_presigned_upload_url(key: str, content_type: str, expires: int = 300) -> str:
    """
    Generate a pre-signed PUT URL so the frontend can upload directly to R2
    without the file passing through the API server.

    Args:
        key: R2 object key, e.g. docs/2026/06/<booking_id>/<uuid>_aadhar.jpg
        content_type: MIME type of the file being uploaded (e.g. 'image/jpeg')
        expires: URL validity in seconds (default 300 = 5 minutes)

    Returns:
        Signed URL string the client can PUT to.
    """
    try:
        url = r2.generate_presigned_url(
            "put_object",
            Params={
                "Bucket":      settings.r2_bucket,
                "Key":         key,
                "ContentType": content_type,
            },
            ExpiresIn=expires,
        )
        return url
    except ClientError as e:
        logging.error(f"Failed to generate presigned upload URL for key={key}: {e}")
        raise


def generate_presigned_download_url(key: str, expires: int = 3600) -> str:
    """
    Generate a pre-signed GET URL for private document access.
    Use this if the R2 bucket is NOT configured with a public domain.

    Args:
        key: R2 object key
        expires: URL validity in seconds (default 3600 = 1 hour)

    Returns:
        Signed URL string the client can GET from.
    """
    try:
        url = r2.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket, "Key": key},
            ExpiresIn=expires,
        )
        return url
    except ClientError as e:
        logging.error(f"Failed to generate presigned download URL for key={key}: {e}")
        raise


def public_url(key: str) -> str:
    """
    Return the Cloudflare R2 public CDN URL for an object key.
    Requires the bucket to have a public domain configured in Cloudflare.

    Args:
        key: R2 object key

    Returns:
        Full public URL string.
    """
    return f"{settings.r2_public_url.rstrip('/')}/{key}"


def delete_file(key: str) -> None:
    """
    Delete a file from Cloudflare R2 bucket.
    """
    try:
        r2.delete_object(Bucket=settings.r2_bucket, Key=key)
    except ClientError as e:
        logging.error(f"Failed to delete object key={key} from R2: {e}")
        raise
