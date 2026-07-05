import os
import sys
import json
import socket
import traceback
from datetime import datetime, timezone
import boto3
from botocore.config import Config
from dotenv import load_dotenv
from supabase import create_client

# =============================================================================
# GAP FIX #1: Row count verification after upload
#   We now verify that the row count in the uploaded JSON matches what
#   Supabase reports, so we catch any silent truncation.
#
# GAP FIX #2: Atomic backup with pre-upload integrity check
#   All data is fetched FIRST, then uploaded. If any table fails to fetch,
#   we abort completely — no partial backup is ever written to R2.
#
# GAP FIX #3: Backup log written locally too
#   Result (success or failure + counts) is saved to backup.log on VPS,
#   giving you a local audit trail even if R2 is unreachable.
# =============================================================================

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backup.log")

def log(msg: str):
    """Write to stdout AND to the local log file with timestamp."""
    line = f"[{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# NOTE: We intentionally do NOT delete old backups.
# Strategy:
#   - Last 7 days  → refreshed every night (rolling daily snapshots)
#   - Older data   → kept in R2 forever as permanent archive
# This means you can always go back to ANY date since the first backup.


def fetch_table(sb_client, table_name: str) -> list:
    """Fetch ALL rows from a table using pagination. Fails hard on error."""
    rows = []
    chunk_size = 1000
    start = 0
    while True:
        end = start + chunk_size - 1
        res = sb_client.table(table_name).select("*").range(start, end).execute()
        data = res.data or []
        rows.extend(data)
        if len(data) < chunk_size:
            break
        start += chunk_size
    return rows


def verify_row_counts(sb_client, backup_data: dict) -> bool:
    """
    GAP FIX #1: Cross-check backup row counts vs live Supabase counts.
    Returns True if all match, False if any mismatch is detected.
    """
    log("Verifying row counts against live Supabase...")
    all_ok = True
    for table, rows in backup_data.items():
        live_res = sb_client.table(table).select("*", count="exact").limit(1).execute()
        live_count = live_res.count
        backed_count = len(rows)
        if live_count != backed_count:
            log(f"  ⚠️  MISMATCH on '{table}': backed up {backed_count} rows but Supabase has {live_count}")
            all_ok = False
        else:
            log(f"  ✓ {table}: {backed_count} rows — matches Supabase")
    return all_ok


def main():
    log("=" * 60)
    log(f"Hotel Santosh — Database Backup Starting (host: {socket.gethostname()})")
    log("=" * 60)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, "../backend/.env")
    if not os.path.exists(env_path):
        log(f"FATAL: .env not found at {env_path}")
        sys.exit(1)
    load_dotenv(env_path)

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    r2_endpoint  = os.getenv("R2_ENDPOINT")
    r2_access_key = os.getenv("R2_ACCESS_KEY")
    r2_secret_key = os.getenv("R2_SECRET_KEY")
    r2_bucket    = os.getenv("R2_BUCKET")

    if not all([supabase_url, supabase_key, r2_endpoint, r2_access_key, r2_secret_key, r2_bucket]):
        log("FATAL: Missing required environment variables in .env")
        sys.exit(1)

    log("Connecting to Supabase...")
    sb_client = create_client(supabase_url, supabase_key)

    log("Connecting to Cloudflare R2...")
    r2_client = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=r2_access_key,
        aws_secret_access_key=r2_secret_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    tables = ["rooms", "customers", "bookings", "documents"]
    backup_data = {}
    timestamp   = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    date_folder = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r2_prefix   = f"backups/db/{date_folder}/"

    # ── PHASE 1: Fetch ALL tables first (GAP FIX #2 — atomic) ────────────────
    log("Phase 1: Fetching all tables from Supabase...")
    for table in tables:
        try:
            log(f"  Fetching {table}...")
            rows = fetch_table(sb_client, table)
            backup_data[table] = rows
            log(f"  ✓ {table}: {len(rows)} rows fetched")
        except Exception as e:
            log(f"FATAL: Failed to fetch table '{table}': {e}")
            log(traceback.format_exc())
            sys.exit(1)

    # ── PHASE 2: Verify counts before upload ─────────────────────────────────
    counts_ok = verify_row_counts(sb_client, backup_data)
    if not counts_ok:
        log("FATAL: Row count mismatch detected — aborting to avoid partial backup")
        sys.exit(1)

    # ── PHASE 3: Upload to R2 ─────────────────────────────────────────────────
    log("Phase 3: Uploading to Cloudflare R2...")
    manifest = {"timestamp": timestamp, "tables": {}}

    for table, rows in backup_data.items():
        json_content = json.dumps(rows, indent=2, default=str)
        key = f"{r2_prefix}{table}_{timestamp}.json"
        r2_client.put_object(
            Bucket=r2_bucket, Key=key,
            Body=json_content, ContentType="application/json"
        )
        log(f"  Uploaded {key} ({len(json_content)} bytes)")
        manifest["tables"][table] = {"key": key, "row_count": len(rows)}

    # Schema backup
    schema_path = os.path.join(script_dir, "../schema.sql")
    if os.path.exists(schema_path):
        try:
            schema_content = open(schema_path, "r", encoding="utf-8").read()
            schema_key = f"{r2_prefix}schema_{timestamp}.sql"
            r2_client.put_object(
                Bucket=r2_bucket, Key=schema_key,
                Body=schema_content, ContentType="application/sql"
            )
            log(f"  Uploaded schema → {schema_key}")
            manifest["schema_key"] = schema_key
        except Exception as e:
            log(f"WARNING: Could not backup schema.sql: {e}")

    # Manifest
    manifest_key = f"{r2_prefix}manifest_{timestamp}.json"
    r2_client.put_object(
        Bucket=r2_bucket, Key=manifest_key,
        Body=json.dumps(manifest, indent=2),
        ContentType="application/json"
    )
    log(f"  Uploaded manifest → {manifest_key}")

    # Latest pointer
    r2_client.put_object(
        Bucket=r2_bucket,
        Key="backups/db/latest.json",
        Body=json.dumps({"latest_manifest": manifest_key, "timestamp": timestamp}, indent=2),
        ContentType="application/json"
    )
    log("  Updated backups/db/latest.json pointer")

    # NOTE: Old backups are intentionally kept forever in R2.
    # Last 7 days = fresh daily snapshots. Older = permanent archive.

    # ── Summary ───────────────────────────────────────────────────────────────
    total_rows = sum(len(v) for v in backup_data.values())
    log("=" * 60)
    log(f"✅ BACKUP SUCCESSFUL")
    log(f"   Timestamp : {timestamp}")
    log(f"   Tables    : {', '.join(f'{t}({len(backup_data[t])})' for t in tables)}")
    log(f"   Total rows: {total_rows}")
    log(f"   R2 prefix : {r2_prefix}")
    log("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        msg = f"UNHANDLED EXCEPTION: {e}\n{traceback.format_exc()}"
        # Try to log it
        try:
            with open(LOG_FILE, "a") as f:
                f.write(f"[CRASH] {msg}\n")
        except Exception:
            pass
        print(msg, file=sys.stderr)
        sys.exit(1)
