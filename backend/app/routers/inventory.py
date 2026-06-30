from fastapi import APIRouter, Depends, Query
from app.database import supabase
from app.auth import get_current_user
from datetime import date

router = APIRouter()

@router.get("")
def get_inventory(query_date: date = Query(alias="date", default=date.today()),
                  user=Depends(get_current_user)):
    # Fetch all active rooms
    rooms_res = supabase.table("rooms").select("*") \
        .eq("is_active", True).order("floor").order("number").execute()
    rooms = rooms_res.data

    # Fetch all bookings active or checked_out on this date
    date_str = query_date.isoformat()
    bookings_res = supabase.table("bookings") \
        .select("id,room_id,room_type,customer_id,check_in,check_out,payment_status,status,total_amount,paid_amount,is_checked_in,customers(name,phone),rooms(number)") \
        .in_("status", ["active", "checked_out"]) \
        .lte("check_in", f"{date_str}T23:59:59+05:30") \
        .gte("check_out",  f"{date_str}T00:00:00+05:30") \
        .execute()

    # Build a room_id → booking lookup (only active bookings occupy a room in grid status)
    booking_map = {b["room_id"]: b for b in bookings_res.data if b["status"] == "active"}

    result = []
    summary = {"vacant": 0, "occupied": 0, "reserved": 0, "unpaid": 0}

    for room in rooms:
        booking = booking_map.get(room["id"])
        if booking is None:
            room_status = "vacant"
            summary["vacant"] += 1
        elif not booking.get("is_checked_in", False):
            # Booked but not checked in yet (reservation / expected arrival / reserved)
            room_status = "reserved"
            summary["reserved"] += 1
        else:
            # Guest has physically checked in
            # They are OCCUPIED (in house), regardless of payment status
            summary["occupied"] += 1
            if booking["payment_status"] in ("unpaid", "partial"):
                # Checked in but has unpaid balance
                room_status = "unpaid"
                summary["unpaid"] += 1
            else:
                # Checked in and fully paid
                room_status = "occupied"

        result.append({
            **room,
            "room_status": room_status,
            "booking": booking,
        })

    return {
        "date": date_str,
        "summary": summary,
        "rooms": result,
        "daily_bookings": bookings_res.data
    }
