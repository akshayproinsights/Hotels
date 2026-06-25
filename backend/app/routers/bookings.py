from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import supabase
from app.auth import get_current_user

router = APIRouter()

class BookingCreate(BaseModel):
    room_id: str
    guest_id: Optional[str] = None        # existing guest UUID
    guest_name: Optional[str] = None      # new guest — one of guest_id OR name+phone required
    guest_phone: Optional[str] = None
    check_in: datetime
    check_out: datetime
    adults: int = 1
    children: int = 0
    extra_beds: int = 0
    room_price: float
    payment_mode: str                     # "Cash" | "UPI" | "Pending"
    payment_status: str = "paid"          # "paid" | "unpaid" | "hold"
    deposit_amount: float = 0
    occupation: Optional[str] = None
    notes: Optional[str] = None

class BookingUpdate(BaseModel):
    check_out: Optional[datetime] = None
    paid_amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_status: Optional[str] = None
    status: Optional[str] = None          # "checked_out" | "cancelled"
    notes: Optional[str] = None

@router.post("")
def create_booking(body: BookingCreate, user=Depends(get_current_user)):
    # 1. Resolve guest
    if body.guest_id:
        guest_id = body.guest_id
    elif body.guest_name and body.guest_phone:
        # Check if guest exists by phone
        existing = supabase.table("guests").select("id") \
            .eq("phone", body.guest_phone).execute()
        if existing.data:
            guest_id = existing.data[0]["id"]
        else:
            new_guest = supabase.table("guests").insert({
                "name": body.guest_name,
                "phone": body.guest_phone,
            }).execute()
            guest_id = new_guest.data[0]["id"]
    else:
        raise HTTPException(status_code=422, detail="Provide guest_id OR guest_name+guest_phone")

    # 2. Calculate totals
    nights = max(1, (body.check_out.date() - body.check_in.date()).days)
    extra_bed_total = body.extra_beds * 500 * nights  # ₹500 per extra bed per night
    total_amount = (body.room_price * nights) + extra_bed_total
    paid_amount = total_amount if body.payment_status == "paid" else body.deposit_amount

    # 3. Insert booking (DB constraint will reject overlapping dates)
    try:
        res = supabase.table("bookings").insert({
            "room_id":         body.room_id,
            "guest_id":        guest_id,
            "check_in":        body.check_in.isoformat(),
            "check_out":       body.check_out.isoformat(),
            "adults":          body.adults,
            "children":        body.children,
            "extra_beds":      body.extra_beds,
            "room_price":      body.room_price,
            "extra_bed_total": extra_bed_total,
            "total_amount":    total_amount,
            "paid_amount":     paid_amount,
            "payment_mode":    body.payment_mode,
            "payment_status":  body.payment_status,
            "deposit_amount":  body.deposit_amount,
            "occupation":      body.occupation,
            "notes":           body.notes,
            "created_by":      user.get("sub"),
        }).execute()
    except Exception as e:
        if "no_overlap" in str(e):
            raise HTTPException(status_code=409, detail="Room already booked for these dates")
        raise

    # 4. Update guest last_visit and total_visits
    guest_res = supabase.table("guests").select("total_visits").eq("id", guest_id).execute()
    current_visits = guest_res.data[0].get("total_visits", 0) if guest_res.data else 0

    supabase.table("guests").update({
        "last_visit": body.check_in.date().isoformat(),
        "total_visits": current_visits + 1,
    }).eq("id", guest_id).execute()

    return res.data[0]

@router.get("/{booking_id}")
def get_booking(booking_id: str, user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("*, rooms(*), guests(*), documents(*)") \
        .eq("id", booking_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    return res.data

@router.patch("/{booking_id}")
def update_booking(booking_id: str, body: BookingUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "check_out" in updates and updates["check_out"] is not None:
        updates["check_out"] = updates["check_out"].isoformat()
    res = supabase.table("bookings").update(updates).eq("id", booking_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    return res.data[0]
