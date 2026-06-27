from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime, timezone
from app.database import supabase
from app.auth import get_current_user

router = APIRouter()

class BookingCreate(BaseModel):
    room_id: str
    room_type: Literal['AC Deluxe', 'Non AC Deluxe', 'AC Standard', 'Non AC Standard']
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
    payment_status: str = "paid"          # "paid" | "unpaid" | "partial" | "hold"
    deposit_amount: float = 0
    occupation: Optional[str] = None
    notes: Optional[str] = None
    total_amount: Optional[float] = None
    guest_address: Optional[str] = None
    guest_age: Optional[int] = None
    is_checked_in: Optional[bool] = None

class RoomBookingInfo(BaseModel):
    room_id: str
    room_type: Literal['AC Deluxe', 'Non AC Deluxe', 'AC Standard', 'Non AC Standard']
    adults: int = 1
    children: int = 0
    extra_beds: int = 0
    room_price: float
    notes: Optional[str] = None

class BookingBatchCreate(BaseModel):
    rooms: list[RoomBookingInfo]
    guest_id: Optional[str] = None
    guest_name: Optional[str] = None
    guest_phone: Optional[str] = None
    check_in: datetime
    check_out: datetime
    payment_mode: str                     # "Cash" | "UPI" | "Pending"
    payment_status: str = "paid"          # "paid" | "unpaid" | "partial" | "hold"
    deposit_amount: float = 0
    occupation: Optional[str] = None
    notes: Optional[str] = None
    total_amount: Optional[float] = None
    guest_address: Optional[str] = None
    guest_age: Optional[int] = None
    is_checked_in: Optional[bool] = None

class BookingUpdate(BaseModel):
    check_out: Optional[datetime] = None
    paid_amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_status: Optional[str] = None
    status: Optional[str] = None          # "checked_out" | "cancelled"
    notes: Optional[str] = None
    total_amount: Optional[float] = None
    actual_checkout_time: Optional[datetime] = None
    is_checked_in: Optional[bool] = None

@router.post("")
def create_booking(body: BookingCreate, user=Depends(get_current_user)):
    # 1. Resolve guest
    guest_data = {}
    if body.guest_name:
        guest_data["name"] = body.guest_name
    if body.guest_phone:
        guest_data["phone"] = body.guest_phone
    if body.guest_address is not None:
        guest_data["address"] = body.guest_address
    if body.guest_age is not None:
        guest_data["age"] = body.guest_age

    if body.guest_id:
        guest_id = body.guest_id
        if guest_data:
            supabase.table("guests").update(guest_data).eq("id", guest_id).execute()
    elif body.guest_phone:
        # Check if guest exists by phone
        existing = supabase.table("guests").select("id") \
            .eq("phone", body.guest_phone).execute()
        if existing.data:
            guest_id = existing.data[0]["id"]
            if guest_data:
                supabase.table("guests").update(guest_data).eq("id", guest_id).execute()
        else:
            new_guest = supabase.table("guests").insert(guest_data).execute()
            guest_id = new_guest.data[0]["id"]
    else:
        raise HTTPException(status_code=422, detail="Provide guest_id OR guest_name+guest_phone")

    # 2. Calculate totals
    nights = max(1, (body.check_out.date() - body.check_in.date()).days)
    extra_bed_total = body.extra_beds * 500 * nights  # ₹500 per extra bed per night
    if body.total_amount is not None:
        total_amount = body.total_amount
    else:
        total_amount = (body.room_price * nights) + extra_bed_total
    # For 'paid': full amount; for 'partial'/'hold'/'unpaid': only the deposit amount received
    paid_amount = total_amount if body.payment_status == "paid" else body.deposit_amount

    actual_payment_status = body.payment_status
    if body.payment_status != "hold":
        if paid_amount >= total_amount:
            actual_payment_status = "paid"
        elif paid_amount > 0:
            actual_payment_status = "partial"
        else:
            actual_payment_status = "unpaid"

    is_checked_in = body.is_checked_in if body.is_checked_in is not None else (actual_payment_status != "hold")

    # 3. Insert booking (DB constraint will reject overlapping dates)
    try:
        res = supabase.table("bookings").insert({
            "room_id":         body.room_id,
            "room_type":       body.room_type,
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
            "payment_status":  actual_payment_status,
            "deposit_amount":  body.deposit_amount,
            "occupation":      body.occupation,
            "notes":           body.notes,
            "created_by":      user.get("sub"),
            "is_checked_in":   is_checked_in,
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

@router.post("/batch")
def create_bookings_batch(body: BookingBatchCreate, user=Depends(get_current_user)):
    if not body.rooms:
        raise HTTPException(status_code=422, detail="At least one room must be selected")

    # 1. Resolve guest
    guest_data = {}
    if body.guest_name:
        guest_data["name"] = body.guest_name
    if body.guest_phone:
        guest_data["phone"] = body.guest_phone
    if body.guest_address is not None:
        guest_data["address"] = body.guest_address
    if body.guest_age is not None:
        guest_data["age"] = body.guest_age

    if body.guest_id:
        guest_id = body.guest_id
        if guest_data:
            supabase.table("guests").update(guest_data).eq("id", guest_id).execute()
    elif body.guest_phone:
        # Check if guest exists by phone
        existing = supabase.table("guests").select("id") \
            .eq("phone", body.guest_phone).execute()
        if existing.data:
            guest_id = existing.data[0]["id"]
            if guest_data:
                supabase.table("guests").update(guest_data).eq("id", guest_id).execute()
        else:
            new_guest = supabase.table("guests").insert(guest_data).execute()
            guest_id = new_guest.data[0]["id"]
    else:
        raise HTTPException(status_code=422, detail="Provide guest_id OR guest_name+guest_phone")

    # 2. Calculate totals and distribute deposit
    nights = max(1, (body.check_out.date() - body.check_in.date()).days)
    
    room_totals = []
    for r in body.rooms:
        extra_bed_total = r.extra_beds * 500 * nights
        room_total = (r.room_price * nights) + extra_bed_total
        room_totals.append(room_total)
        
    remaining_deposit = body.deposit_amount
    bookings_to_create = []
    
    for i, r in enumerate(body.rooms):
        room_total = room_totals[i]
        extra_bed_total = r.extra_beds * 500 * nights
        
        if body.payment_status == "paid":
            room_paid = room_total
            room_status = "paid"
            room_dep = 0
        elif body.payment_status == "hold":
            room_dep = body.deposit_amount / len(body.rooms)
            room_paid = room_dep
            room_status = "hold"
        else:
            room_dep = min(remaining_deposit, room_total)
            remaining_deposit -= room_dep
            room_paid = room_dep
            if room_paid >= room_total:
                room_status = "paid"
            elif room_paid > 0:
                room_status = "partial"
            else:
                room_status = "unpaid"
                
        bookings_to_create.append({
            "room_id":         r.room_id,
            "room_type":       r.room_type,
            "guest_id":        guest_id,
            "check_in":        body.check_in.isoformat(),
            "check_out":       body.check_out.isoformat(),
            "adults":          r.adults,
            "children":        r.children,
            "extra_beds":      r.extra_beds,
            "room_price":      r.room_price,
            "extra_bed_total": extra_bed_total,
            "total_amount":    room_total,
            "paid_amount":     room_paid,
            "payment_mode":    body.payment_mode,
            "payment_status":  room_status,
            "deposit_amount":  room_dep,
            "occupation":      body.occupation,
            "notes":           r.notes or body.notes,
            "created_by":      user.get("sub"),
            "is_checked_in":   body.is_checked_in if body.is_checked_in is not None else (room_status != "hold"),
        })

    # 3. Insert bookings atomically
    try:
        res = supabase.table("bookings").insert(bookings_to_create).execute()
    except Exception as e:
        if "no_overlap" in str(e):
            raise HTTPException(status_code=409, detail="One or more rooms are already booked for these dates")
        raise

    # 4. Update guest last_visit and total_visits
    guest_res = supabase.table("guests").select("total_visits").eq("id", guest_id).execute()
    current_visits = guest_res.data[0].get("total_visits", 0) if guest_res.data else 0

    supabase.table("guests").update({
        "last_visit": body.check_in.date().isoformat(),
        "total_visits": current_visits + len(bookings_to_create),
    }).eq("id", guest_id).execute()

    return res.data

@router.get("/{booking_id}/check-extension")
def check_booking_extension(booking_id: str, check_out: datetime, user=Depends(get_current_user)):
    # 1. Fetch current booking details (room_id, check_in)
    curr_res = supabase.table("bookings").select("room_id, check_in, status").eq("id", booking_id).single().execute()
    if not curr_res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    curr = curr_res.data
    room_id = curr["room_id"]
    check_in = curr["check_in"]
    
    # 2. Check for overlapping bookings (excluding this booking)
    # Overlapping active bookings: check_in < proposed check_out AND check_out > current check_in
    overlap_res = supabase.table("bookings") \
        .select("id, booking_number, check_in, check_out, guests(name)") \
        .eq("room_id", room_id) \
        .eq("status", "active") \
        .neq("id", booking_id) \
        .lt("check_in", check_out.isoformat()) \
        .gt("check_out", check_in) \
        .execute()
        
    if overlap_res.data:
        other = overlap_res.data[0]
        guest_name = other.get("guests", {}).get("name", "Another guest") if other.get("guests") else "Another guest"
        return {
            "available": False,
            "reason": f"Room is already booked by {guest_name} from {other['check_in']} to {other['check_out']}."
        }
        
    return {
        "available": True,
        "reason": "Room is available."
    }

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

    # Enforce database consistency between paid_amount, total_amount, and payment_status
    if "paid_amount" in updates or "total_amount" in updates or "payment_status" in updates:
        curr_res = supabase.table("bookings").select("paid_amount, total_amount, payment_status").eq("id", booking_id).single().execute()
        if curr_res.data:
            curr = curr_res.data
            p_amt = updates.get("paid_amount", curr["paid_amount"])
            t_amt = updates.get("total_amount", curr["total_amount"])
            p_status = updates.get("payment_status", curr["payment_status"])
            if p_status != "hold":
                if p_amt >= t_amt:
                    updates["payment_status"] = "paid"
                elif p_amt > 0:
                    updates["payment_status"] = "partial"
                else:
                    updates["payment_status"] = "unpaid"
    if "check_out" in updates and updates["check_out"] is not None:
        updates["check_out"] = updates["check_out"].isoformat()
        
        # Pre-check for overlapping bookings
        curr_res = supabase.table("bookings").select("room_id, check_in").eq("id", booking_id).single().execute()
        if not curr_res.data:
            raise HTTPException(status_code=404, detail="Booking not found")
        curr = curr_res.data
        
        overlap_res = supabase.table("bookings") \
            .select("id") \
            .eq("room_id", curr["room_id"]) \
            .eq("status", "active") \
            .neq("id", booking_id) \
            .lt("check_in", updates["check_out"]) \
            .gt("check_out", curr["check_in"]) \
            .execute()
            
        if overlap_res.data:
            raise HTTPException(
                status_code=409,
                detail="Room is already booked or occupied by another guest during this extended period."
            )

    if "actual_checkout_time" in updates and updates["actual_checkout_time"] is not None:
        updates["actual_checkout_time"] = updates["actual_checkout_time"].isoformat()
    elif updates.get("status") == "checked_out" and "actual_checkout_time" not in updates:
        updates["actual_checkout_time"] = datetime.now(timezone.utc).isoformat()

    try:
        res = supabase.table("bookings").update(updates).eq("id", booking_id).execute()
    except Exception as e:
        if "no_overlap" in str(e):
            raise HTTPException(status_code=409, detail="Room already booked for these dates")
        raise
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    return res.data[0]
