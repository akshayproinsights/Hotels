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

    # Fetch all bookings active on this date
    date_str = query_date.isoformat()
    bookings_res = supabase.table("bookings") \
        .select("id,room_id,room_type,guest_id,check_in,check_out,payment_status,total_amount,paid_amount,guests(name,phone)") \
        .eq("status", "active") \
        .lte("check_in", f"{date_str}T23:59:59+05:30") \
        .gt("check_out",  f"{date_str}T00:00:00+05:30") \
        .execute()

    # Build a room_id → booking lookup
    booking_map = {b["room_id"]: b for b in bookings_res.data}

    result = []
    summary = {"vacant": 0, "occupied": 0, "hold": 0, "unpaid": 0}

    for room in rooms:
        booking = booking_map.get(room["id"])
        if booking is None:
            room_status = "vacant"
            summary["vacant"] += 1
        elif booking["payment_status"] == "hold":
            room_status = "hold"
            summary["hold"] += 1
        elif booking["payment_status"] in ("unpaid", "partial"):
            room_status = "unpaid"
            summary["unpaid"] += 1
        else:
            room_status = "occupied"
            summary["occupied"] += 1

        result.append({
            **room,
            "room_status": room_status,
            "booking": booking,
        })

    return {"date": date_str, "summary": summary, "rooms": result}
