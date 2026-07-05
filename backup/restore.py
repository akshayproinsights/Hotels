"""
Hotel Santosh — Restore Script
================================
Restores any table (or all tables) from an R2 backup back into Supabase.

Usage examples:
  # Restore ALL tables from the latest backup
  python restore.py

  # Restore ALL tables from a specific date
  python restore.py --date 2026-07-04

  # Restore only bookings from a specific date
  python restore.py --date 2026-07-04 --table bookings

  # List all available backups in R2
  python restore.py --list

  # Dry run — shows what would be restored but does NOT write to Supabase
  python restore.py --date 2026-07-04 --dry-run
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone
import boto3
from botocore.config import Config
from dotenv import load_dotenv
from supabase import create_client

# ── Load credentials ─────────────────────────────────────────────────────────
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path   = os.path.join(script_dir, "../backend/.env")
load_dotenv(env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
R2_ENDPOINT  = os.getenv("R2_ENDPOINT")
R2_ACCESS    = os.getenv("R2_ACCESS_KEY")
R2_SECRET    = os.getenv("R2_SECRET_KEY")
R2_BUCKET    = os.getenv("R2_BUCKET")

ALL_TABLES   = ["rooms", "customers", "bookings", "documents"]

# Restore order matters — rooms and customers must exist before bookings/documents
RESTORE_ORDER = ["rooms", "customers", "bookings", "documents"]


def make_r2():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS,
        aws_secret_access_key=R2_SECRET,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def list_backups(r2):
    """List all available backup dates in R2, newest first."""
    paginator = r2.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=R2_BUCKET, Prefix="backups/db/")
    dates = set()
    for page in pages:
        for obj in page.get("Contents", []):
            parts = obj["Key"].split("/")
            if len(parts) >= 4 and parts[2].count("-") == 2:
                dates.add(parts[2])
    return sorted(dates, reverse=True)


def get_manifest_for_date(r2, date_str: str) -> dict:
    """Find and return the most recent manifest for a given date (YYYY-MM-DD)."""
    paginator = r2.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=R2_BUCKET, Prefix=f"backups/db/{date_str}/manifest_")
    manifests = []
    for page in pages:
        for obj in page.get("Contents", []):
            manifests.append(obj["Key"])
    if not manifests:
        return None
    # Pick the most recent one (sorted alphabetically = chronologically)
    manifests.sort()
    key = manifests[-1]
    print(f"  Using manifest: {key}")
    data = r2.get_object(Bucket=R2_BUCKET, Key=key)["Body"].read()
    return json.loads(data)


def download_table(r2, key: str) -> list:
    """Download a table JSON from R2 and return as list of dicts."""
    data = r2.get_object(Bucket=R2_BUCKET, Key=key)["Body"].read()
    return json.loads(data)


def restore_table_to_supabase(sb, table_name: str, rows: list, dry_run: bool):
    """
    Restore rows into Supabase.
    Strategy: upsert (insert or update by primary key).
    This is safe to run even if some rows already exist.
    """
    if dry_run:
        print(f"  [DRY RUN] Would upsert {len(rows)} rows into '{table_name}'")
        return

    if not rows:
        print(f"  No rows to restore for '{table_name}' — skipping")
        return

    chunk_size = 500  # Supabase handles up to 1000, using 500 to be safe
    total_upserted = 0
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i + chunk_size]
        sb.table(table_name).upsert(chunk, on_conflict="id").execute()
        total_upserted += len(chunk)
        print(f"  Upserted {total_upserted}/{len(rows)} rows into '{table_name}'...")

    print(f"  ✅ '{table_name}' restored: {len(rows)} rows")


def main():
    parser = argparse.ArgumentParser(
        description="Restore Hotel Santosh database from R2 backup"
    )
    parser.add_argument(
        "--date",
        help="Backup date to restore from (YYYY-MM-DD). Defaults to latest.",
        default=None,
    )
    parser.add_argument(
        "--table",
        help=f"Specific table to restore. If omitted, restores all. Options: {', '.join(ALL_TABLES)}",
        default=None,
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all available backup dates and exit.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be restored but do NOT write to Supabase.",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Hotel Santosh — Restore Utility")
    print("=" * 60)

    r2 = make_r2()

    # ── List mode ────────────────────────────────────────────────────────────
    if args.list:
        print("\nAvailable backup dates in R2 (newest first):\n")
        dates = list_backups(r2)
        if not dates:
            print("  No backups found.")
        for d in dates:
            print(f"  📁 {d}")
        print(f"\nTotal: {len(dates)} backup date(s)")
        sys.exit(0)

    # ── Resolve date ─────────────────────────────────────────────────────────
    if args.date:
        target_date = args.date
        # Validate format
        try:
            datetime.strptime(target_date, "%Y-%m-%d")
        except ValueError:
            print(f"ERROR: Invalid date format '{target_date}'. Use YYYY-MM-DD.")
            sys.exit(1)
    else:
        print("No --date specified. Looking up latest backup...")
        data = json.loads(r2.get_object(Bucket=R2_BUCKET, Key="backups/db/latest.json")["Body"].read())
        # Extract date from latest manifest key
        manifest_key = data["latest_manifest"]
        target_date  = manifest_key.split("/")[2]
        print(f"  Latest backup date: {target_date}")

    print(f"\nRestoring from date: {target_date}")
    if args.dry_run:
        print("  ⚠️  DRY RUN MODE — nothing will be written to Supabase\n")

    # ── Load manifest ─────────────────────────────────────────────────────────
    manifest = get_manifest_for_date(r2, target_date)
    if not manifest:
        print(f"ERROR: No manifest found for date '{target_date}'. Run --list to see available dates.")
        sys.exit(1)

    print(f"\nManifest summary:")
    for t, info in manifest["tables"].items():
        print(f"  {t}: {info['row_count']} rows")

    # ── Determine which tables to restore ────────────────────────────────────
    if args.table:
        if args.table not in ALL_TABLES:
            print(f"ERROR: Unknown table '{args.table}'. Options: {', '.join(ALL_TABLES)}")
            sys.exit(1)
        tables_to_restore = [args.table]
    else:
        tables_to_restore = RESTORE_ORDER

    # ── Confirmation prompt (skip for dry-run) ────────────────────────────────
    if not args.dry_run:
        print(f"\n⚠️  This will UPSERT data into Supabase: {', '.join(tables_to_restore)}")
        print("   Existing rows with the same ID will be UPDATED.")
        confirm = input("   Type 'yes' to proceed: ").strip().lower()
        if confirm != "yes":
            print("Aborted.")
            sys.exit(0)

    # ── Connect to Supabase ───────────────────────────────────────────────────
    if not args.dry_run:
        print("\nConnecting to Supabase...")
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    else:
        sb = None

    # ── Restore each table ────────────────────────────────────────────────────
    print(f"\nRestoring {len(tables_to_restore)} table(s)...\n")
    for table in tables_to_restore:
        if table not in manifest["tables"]:
            print(f"  WARNING: '{table}' not found in manifest — skipping")
            continue
        key = manifest["tables"][table]["key"]
        print(f"  Downloading '{table}' from R2...")
        rows = download_table(r2, key)
        print(f"  Downloaded {len(rows)} rows")
        restore_table_to_supabase(sb, table, rows, dry_run=args.dry_run)
        print()

    print("=" * 60)
    if args.dry_run:
        print("✅ DRY RUN complete — no data was written")
    else:
        print("✅ RESTORE COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
