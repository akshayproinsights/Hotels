from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import date, datetime, timedelta, timezone
from app.database import supabase
from app.auth import get_current_user

router = APIRouter()

# Timezone constant for IST (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))


def to_ist_date(ts_str: str) -> date:
    """Parse a Supabase ISO timestamp string and return its date in IST."""
    ts_str = ts_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(ts_str)
    return dt.astimezone(IST).date()


@router.get("/daily")
def get_daily_report(
    query_date: date = Query(alias="date", default_factory=date.today),
    user=Depends(get_current_user),
):
    start_str = f"{query_date}T00:00:00+05:30"
    end_str = f"{query_date}T23:59:59.999999+05:30"

    # Query bookings created on query_date
    res_created = (
        supabase.table("bookings")
        .select("*, rooms(number), guests(name, phone)")
        .neq("status", "cancelled")
        .gte("created_at", start_str)
        .lte("created_at", end_str)
        .execute()
    )

    # Query bookings whose updated_at falls on query_date (payment collected later)
    res_updated = (
        supabase.table("bookings")
        .select("*, rooms(number), guests(name, phone)")
        .neq("status", "cancelled")
        .gte("updated_at", start_str)
        .lte("updated_at", end_str)
        .execute()
    )

    # Merge into a single map, preferring the most-recent record
    bookings_map: dict = {}
    for b in res_created.data:
        bookings_map[b["id"]] = b
    for b in res_updated.data:
        # If already present prefer the updated record (it's the same row anyway)
        bookings_map[b["id"]] = b

    total_collected = 0.0
    cash_collected = 0.0
    upi_collected = 0.0
    payment_details = []

    for b in bookings_map.values():
        c_date = to_ist_date(b["created_at"])
        u_date = to_ist_date(b["updated_at"])

        paid_amount = float(b["paid_amount"] or 0)
        deposit_amount = float(b["deposit_amount"] or 0)
        total_amount = float(b["total_amount"] or 0)

        collected_amount = 0.0
        payment_type = ""

        if c_date == query_date:
            # Booking was created today.
            # NOTE: Supabase always sets updated_at = created_at on INSERT, so
            # u_date == c_date for every new booking.  We therefore distinguish
            # whether a later update also happened on the same calendar day by
            # comparing the raw ISO strings rather than just the dates.
            created_ts = b["created_at"]
            updated_ts = b["updated_at"]
            same_instant = (
                created_ts[:19] == updated_ts[:19]
            )  # identical to the second

            if same_instant:
                # Pure creation — no subsequent payment event today
                if b["payment_status"] == "paid":
                    collected_amount = paid_amount
                    payment_type = "Initial Payment"
                elif b["payment_status"] in ("hold",):
                    collected_amount = deposit_amount
                    payment_type = "Deposit"
                else:
                    # unpaid / Pending — record booking in ledger with ₹0 so
                    # the staff can see the booking was created today
                    collected_amount = 0.0
                    payment_type = "Pending Check-In"
            else:
                # Created AND updated today (e.g. created then immediately
                # marked paid within the same day)
                collected_amount = paid_amount
                payment_type = "Initial Payment" if b["payment_status"] == "paid" else "Deposit"

        elif u_date == query_date:
            # Created on a previous day, updated/paid today
            collected_amount = max(0.0, paid_amount - deposit_amount)
            payment_type = "Final Settlement"

        # Include in ledger if there's any amount OR if booking was created today
        # (so pending check-ins are visible with ₹0 collected)
        if collected_amount > 0 or payment_type:
            mode = b["payment_mode"] or "Pending"
            if mode == "Cash":
                cash_collected += collected_amount
            elif mode == "UPI":
                upi_collected += collected_amount

            total_collected += collected_amount
            pending_amt = max(0.0, total_amount - paid_amount)

            payment_details.append(
                {
                    "id": b["id"],
                    "booking_number": b["booking_number"],
                    "guest_name": b["guests"]["name"] if b["guests"] else "Guest",
                    "room_number": b["rooms"]["number"] if b["rooms"] else "—",
                    "collected_amount": collected_amount,
                    "payment_mode": mode,
                    "payment_type": payment_type,
                    "total_amount": total_amount,
                    "paid_amount": paid_amount,
                    "pending_amount": pending_amt,
                    "status": b["status"],
                }
            )

    # Calculate total unpaid dues for all bookings overlapping this day
    pending_dues = 0.0
    dues_res = (
        supabase.table("bookings")
        .select("total_amount, paid_amount")
        .neq("status", "cancelled")
        .lte("check_in", f"{query_date}T23:59:59+05:30")
        .gt("check_out", f"{query_date}T00:00:00+05:30")
        .execute()
    )
    for b in dues_res.data:
        pending_dues += max(
            0.0, float(b["total_amount"] or 0) - float(b["paid_amount"] or 0)
        )

    # Bookings checked in today
    check_ins = supabase.table("bookings").select("id", count="exact") \
        .gte("check_in", start_str) \
        .lte("check_in", end_str).execute().count

    # Bookings checked out today
    check_outs = supabase.table("bookings").select("id", count="exact") \
        .gte("check_out", start_str) \
        .lte("check_out", end_str).execute().count

    # Occupancy for today
    active = supabase.table("bookings") \
        .select("id") \
        .neq("status", "cancelled") \
        .lte("check_in", end_str) \
        .gt("check_out", start_str).execute().data
    
    rooms_count = supabase.table("rooms").select("id", count="exact") \
        .eq("is_active", True).execute().count

    return {
        "date": query_date.isoformat(),
        "check_ins_today": check_ins,
        "check_outs_today": check_outs,
        "occupancy": {
            "total_rooms": rooms_count,
            "occupied": len(active),
            "pct": round(len(active) / rooms_count * 100, 1) if rooms_count else 0,
        },
        "total_collected": total_collected,
        "cash_collected": cash_collected,
        "upi_collected": upi_collected,
        "pending_dues": pending_dues,
        "payments": payment_details,
    }

@router.get("/unpaid")
def unpaid_dues(user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("id,booking_number,check_in,check_out,total_amount,paid_amount,deposit_amount,payment_status,rooms(number),guests(name,phone)") \
        .neq("status", "cancelled") \
        .in_("payment_status", ["unpaid", "partial", "hold"]) \
        .order("check_in").execute()
    return res.data



@router.get("/monthly")
def get_monthly_report(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    user=Depends(get_current_user),
):
    # Validate the combination (e.g. year=2000, month=2 is fine)
    try:
        start_date = date(year, month, 1)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid year/month combination")

    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)

    days_in_month = (end_date - start_date).days + 1

    start_str = f"{start_date.isoformat()}T00:00:00+05:30"
    end_str = f"{end_date.isoformat()}T23:59:59+05:30"

    # Fetch active rooms
    rooms_res = supabase.table("rooms").select("*").eq("is_active", True).execute()
    rooms = rooms_res.data
    total_rooms = len(rooms)
    available_room_nights = total_rooms * days_in_month

    # Room-type stats seed (ensures all four types always appear)
    room_types = ["AC Deluxe", "Non AC Deluxe", "AC Standard", "Non AC Standard"]
    type_stats: dict = {
        t: {"occupied_nights": 0, "revenue": 0.0, "total_rooms": 0} for t in room_types
    }
    for r in rooms:
        rtype = r["room_type"]
        if rtype in type_stats:
            type_stats[rtype]["total_rooms"] += 1

    # Fetch bookings overlapping with the month (exclude cancelled)
    bookings_res = (
        supabase.table("bookings")
        .select("*, rooms(*)")
        .neq("status", "cancelled")
        .lt("check_in", end_str)
        .gt("check_out", start_str)
        .execute()
    )
    bookings = bookings_res.data

    occupied_nights = 0
    total_rent_revenue = 0.0
    total_extra_bed_revenue = 0.0

    for b in bookings:
        c_in = datetime.fromisoformat(
            b["check_in"].replace("Z", "+00:00")
        ).astimezone(IST).date()
        c_out = datetime.fromisoformat(
            b["check_out"].replace("Z", "+00:00")
        ).astimezone(IST).date()

        total_nights = max(1, (c_out - c_in).days)

        # Count nights that fall within the month
        overlap_nights = sum(
            1
            for i in range(total_nights)
            if start_date <= (c_in + timedelta(days=i)) <= end_date
        )

        if overlap_nights > 0:
            occupied_nights += overlap_nights
            room_rev = float(b["room_price"] or 0) * overlap_nights
            # Pro-rate extra bed revenue proportionally
            extra_rev = (float(b["extra_bed_total"] or 0) / total_nights) * overlap_nights

            total_rent_revenue += room_rev
            total_extra_bed_revenue += extra_rev

            rtype = b.get("room_type") or (b["rooms"]["room_type"] if b.get("rooms") else None)
            if rtype in type_stats:
                type_stats[rtype]["occupied_nights"] += overlap_nights
                type_stats[rtype]["revenue"] += room_rev + extra_rev

    total_revenue = total_rent_revenue + total_extra_bed_revenue
    occupancy_rate = (
        (occupied_nights / available_room_nights * 100)
        if available_room_nights > 0
        else 0.0
    )
    adr = total_rent_revenue / occupied_nights if occupied_nights > 0 else 0.0
    revpar = total_rent_revenue / available_room_nights if available_room_nights > 0 else 0.0

    room_type_performance = []
    for rtype, stats in type_stats.items():
        type_avail = stats["total_rooms"] * days_in_month
        type_occ_rate = (
            (stats["occupied_nights"] / type_avail * 100) if type_avail > 0 else 0.0
        )
        room_type_performance.append(
            {
                "room_type": rtype,
                "occupied_nights": stats["occupied_nights"],
                "available_nights": type_avail,
                "occupancy_rate": type_occ_rate,
                "revenue": stats["revenue"],
            }
        )

    return {
        "year": year,
        "month": month,
        "revenue": {
            "total": total_revenue,
            "room": total_rent_revenue,
            "extra_bed": total_extra_bed_revenue,
        },
        "occupancy": {
            "available_room_nights": available_room_nights,
            "occupied_room_nights": occupied_nights,
            "rate": occupancy_rate,
        },
        "adr": adr,
        "revpar": revpar,
        "room_type_performance": room_type_performance,
    }
