from datetime import datetime, date, timedelta, timezone
import calendar as pycalendar
from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.database import supabase
from app.auth import get_current_user
import logging

router = APIRouter()

# Local timezone helper for IST (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))

@router.get("")
def get_calendar(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    user=Depends(get_current_user)
):
    """
    Get per-day vacant/occupied counts + status for a given month and year.
    Status values: 'vacant' (5+ vacant), 'few_left' (1-4 vacant), 'full' (0 vacant).
    """
    try:
        # Fetch all active rooms count
        rooms_res = supabase.table("rooms").select("id").eq("is_active", True).execute()
        total_rooms = len(rooms_res.data)
    except Exception as e:
        logging.error(f"Error fetching rooms in calendar: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving rooms database"
        )

    _, last_day = pycalendar.monthrange(year, month)
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)

    # Start and end timestamps in IST (standard format with offset)
    start_str = f"{start_date.isoformat()}T00:00:00+05:30"
    end_str = f"{end_date.isoformat()}T23:59:59+05:30"

    try:
        # Fetch all active bookings overlapping with the month range
        bookings_res = supabase.table("bookings") \
            .select("room_id,check_in,check_out,payment_status") \
            .eq("status", "active") \
            .lte("check_in", end_str) \
            .gt("check_out", start_str) \
            .execute()
    except Exception as e:
        logging.error(f"Error fetching bookings in calendar: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving bookings database"
        )

    bookings = bookings_res.data

    # Parse bookings to timezone-aware datetimes in IST
    parsed_bookings = []
    for b in bookings:
        try:
            ci = datetime.fromisoformat(b["check_in"].replace("Z", "+00:00")).astimezone(IST)
            co = datetime.fromisoformat(b["check_out"].replace("Z", "+00:00")).astimezone(IST)
            parsed_bookings.append({
                "room_id": b["room_id"],
                "check_in": ci,
                "check_out": co,
                "payment_status": b.get("payment_status", "paid")
            })
        except Exception as ex:
            logging.warning(f"Failed to parse booking dates: {str(ex)}")
            continue

    days_data = []
    for d in range(1, last_day + 1):
        day_date = date(year, month, d)
        
        # Define day start and end in IST
        day_start = datetime(year, month, d, 0, 0, 0, tzinfo=IST)
        day_end = datetime(year, month, d, 23, 59, 59, tzinfo=IST)

        # Count occupied rooms and pending bookings for this day
        occupied_rooms = set()
        pending_count = 0
        for pb in parsed_bookings:
            # Overlap: booking starts before end of day, and ends after start of day
            if pb["check_in"] <= day_end and pb["check_out"] > day_start:
                occupied_rooms.add(pb["room_id"])
                if pb.get("payment_status") in ("unpaid", "partial", "hold"):
                    pending_count += 1
        
        occupied_count = len(occupied_rooms)
        vacant_count = max(0, total_rooms - occupied_count)

        # Determine status
        if vacant_count >= 5:
            day_status = 'vacant'
        elif vacant_count >= 1:
            day_status = 'few_left'
        else:
            day_status = 'full'

        days_data.append({
            "date": day_date.isoformat(),
            "vacant": vacant_count,
            "occupied": occupied_count,
            "pending": pending_count,
            "status": day_status
        })

    return {
        "month": month,
        "year": year,
        "total_rooms": total_rooms,
        "days": days_data
    }
