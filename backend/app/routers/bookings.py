from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid
from typing import Optional, Literal
from datetime import datetime, timezone, timedelta
from app.database import supabase
from app.auth import get_current_user

# Local timezone helper for IST (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))

router = APIRouter()

def map_booking_payment_mode(booking: dict) -> dict:
    if not booking:
        return booking
    payment_mode = booking.get("payment_mode")
    notes = booking.get("notes") or ""
    if payment_mode == "UPI" and ("[Paid via IDFC Bank]" in notes or "[IDFC Bank]" in notes):
        booking["payment_mode"] = "IDFC"
    return booking

def map_bookings_payment_mode(bookings: list) -> list:
    if not bookings:
        return bookings
    return [map_booking_payment_mode(b) for b in bookings]

class BookingCreate(BaseModel):
    room_id: str
    room_type: Literal['AC Deluxe', 'Non AC Deluxe', 'VIP AC Suite', 'VIP Non AC Suite']
    customer_id: Optional[str] = None        # existing customer UUID
    customer_name: Optional[str] = None      # new customer — one of customer_id OR name+phone required
    customer_phone: Optional[str] = None
    check_in: datetime
    check_out: datetime
    adults: int = 1
    children: int = 0
    extra_beds: int = 0
    room_price: float
    payment_mode: str                     # "Cash" | "UPI" | "Pending"
    payment_status: str = "paid"          # "paid" | "unpaid" | "partial" | "reserved"
    deposit_amount: float = 0
    occupation: Optional[str] = None
    notes: Optional[str] = None
    total_amount: Optional[float] = None
    customer_address: Optional[str] = None
    customer_age: Optional[int] = None
    is_checked_in: Optional[bool] = None
    actual_checkin_time: Optional[datetime] = None
    extra_bill_amount: Optional[float] = 0.0
    extra_bill_note: Optional[str] = None

class RoomBookingInfo(BaseModel):
    room_id: str
    room_type: Literal['AC Deluxe', 'Non AC Deluxe', 'VIP AC Suite', 'VIP Non AC Suite']
    adults: int = 1
    children: int = 0
    extra_beds: int = 0
    room_price: float
    notes: Optional[str] = None

class BookingBatchCreate(BaseModel):
    rooms: list[RoomBookingInfo]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    check_in: datetime
    check_out: datetime
    payment_mode: str                     # "Cash" | "UPI" | "Pending"
    payment_status: str = "paid"          # "paid" | "unpaid" | "partial" | "reserved"
    deposit_amount: float = 0
    occupation: Optional[str] = None
    notes: Optional[str] = None
    total_amount: Optional[float] = None
    customer_address: Optional[str] = None
    customer_age: Optional[int] = None
    is_checked_in: Optional[bool] = None
    actual_checkin_time: Optional[datetime] = None
    extra_bill_amount: Optional[float] = 0.0
    extra_bill_note: Optional[str] = None

class BookingUpdate(BaseModel):
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    room_id: Optional[str] = None
    room_type: Optional[str] = None
    adults: Optional[int] = None
    children: Optional[int] = None
    extra_beds: Optional[int] = None
    room_price: Optional[float] = None
    paid_amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_status: Optional[str] = None
    status: Optional[str] = None          # "checked_out" | "cancelled"
    notes: Optional[str] = None
    total_amount: Optional[float] = None
    actual_checkout_time: Optional[datetime] = None
    actual_checkin_time: Optional[datetime] = None
    is_checked_in: Optional[bool] = None
    extra_bill_amount: Optional[float] = None
    extra_bill_note: Optional[str] = None

@router.post("")
def create_booking(body: BookingCreate, user=Depends(get_current_user)):
    # 1. Resolve customer
    customer_data = {}
    if body.customer_name:
        customer_data["name"] = body.customer_name
    if body.customer_phone:
        customer_data["phone"] = body.customer_phone
    if body.customer_address is not None:
        customer_data["address"] = body.customer_address
    if body.customer_age is not None:
        customer_data["age"] = body.customer_age

    if body.customer_id:
        customer_id = body.customer_id
        if customer_data:
            supabase.table("customers").update(customer_data).eq("id", customer_id).execute()
    elif body.customer_phone:
        # Check if customer exists by phone
        existing = supabase.table("customers").select("id") \
            .eq("phone", body.customer_phone).execute()
        if existing.data:
            customer_id = existing.data[0]["id"]
            if customer_data:
                supabase.table("customers").update(customer_data).eq("id", customer_id).execute()
        else:
            new_customer = supabase.table("customers").insert(customer_data).execute()
            customer_id = new_customer.data[0]["id"]
    else:
        raise HTTPException(status_code=422, detail="Provide customer_id OR customer_name+customer_phone")

    # 2. Calculate totals
    is_checked_in = body.is_checked_in if body.is_checked_in is not None else (body.payment_status != "reserved")
    
    check_in_dt = body.check_in
    if is_checked_in:
        check_in_dt = datetime.now(timezone.utc)
        
    check_in_date_local = check_in_dt.astimezone(IST).date() if check_in_dt.tzinfo else check_in_dt.date()
    check_out_date_local = body.check_out.astimezone(IST).date() if body.check_out.tzinfo else body.check_out.date()
    nights = max(1, (check_out_date_local - check_in_date_local).days)

    room_res = supabase.table("rooms").select("extra_bed_price").eq("id", body.room_id).execute()
    extra_bed_price = room_res.data[0]["extra_bed_price"] if room_res.data and "extra_bed_price" in room_res.data[0] else 500.0
    extra_bed_total = body.extra_beds * float(extra_bed_price) * nights
    extra_bill_amount = body.extra_bill_amount or 0.0
    if body.total_amount is not None:
        total_amount = body.total_amount
    else:
        total_amount = (body.room_price * nights) + extra_bed_total + extra_bill_amount
    # For 'paid': full amount; for 'partial'/'reserved'/'unpaid': only the deposit amount received
    paid_amount = total_amount if body.payment_status == "paid" else body.deposit_amount

    actual_payment_status = body.payment_status
    if body.payment_status != "reserved":
        if paid_amount >= total_amount:
            actual_payment_status = "paid"
        elif paid_amount > 0:
            actual_payment_status = "partial"
        else:
            actual_payment_status = "unpaid"

    # 3. Insert booking (DB constraint will reject overlapping dates)
    try:
        res = supabase.table("bookings").insert({
            "room_id":         body.room_id,
            "room_type":       body.room_type,
            "customer_id":     customer_id,
            "check_in":        check_in_dt.isoformat(),
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
            "actual_checkin_time": (body.actual_checkin_time.isoformat() if body.actual_checkin_time else (check_in_dt.isoformat() if is_checked_in else None)),
            "extra_bill_amount": extra_bill_amount,
            "extra_bill_note":   body.extra_bill_note,
        }).execute()
    except Exception as e:
        if "no_overlap" in str(e):
            raise HTTPException(status_code=409, detail="Room already booked for these dates")
        if "bookings_payment_mode_check" in str(e) or "23514" in str(e):
            # Fallback for IDFC if DB check constraint does not include IDFC
            notes_text = f"{body.notes} [IDFC Bank]" if body.notes else "[IDFC Bank]"
            res = supabase.table("bookings").insert({
                "room_id":         body.room_id,
                "room_type":       body.room_type,
                "customer_id":     customer_id,
                "check_in":        check_in_dt.isoformat(),
                "check_out":       body.check_out.isoformat(),
                "adults":          body.adults,
                "children":        body.children,
                "extra_beds":      body.extra_beds,
                "room_price":      body.room_price,
                "extra_bed_total": extra_bed_total,
                "total_amount":    total_amount,
                "paid_amount":     paid_amount,
                "payment_mode":    "UPI" if body.payment_mode == "IDFC" else body.payment_mode,
                "payment_status":  actual_payment_status,
                "deposit_amount":  body.deposit_amount,
                "occupation":      body.occupation,
                "notes":           notes_text,
                "created_by":      user.get("sub"),
                "is_checked_in":   is_checked_in,
                "actual_checkin_time": (body.actual_checkin_time.isoformat() if body.actual_checkin_time else (check_in_dt.isoformat() if is_checked_in else None)),
                "extra_bill_amount": extra_bill_amount,
                "extra_bill_note":   body.extra_bill_note,
            }).execute()
        else:
            raise

    # 4. Update customer last_visit and total_visits
    customer_res = supabase.table("customers").select("total_visits").eq("id", customer_id).execute()
    current_visits = customer_res.data[0].get("total_visits", 0) if customer_res.data else 0

    supabase.table("customers").update({
        "last_visit": body.check_in.date().isoformat(),
        "total_visits": current_visits + 1,
    }).eq("id", customer_id).execute()

    return map_booking_payment_mode(res.data[0])

@router.post("/batch")
def create_bookings_batch(body: BookingBatchCreate, user=Depends(get_current_user)):
    if not body.rooms:
        raise HTTPException(status_code=422, detail="At least one room must be selected")

    # 1. Resolve customer
    customer_data = {}
    if body.customer_name:
        customer_data["name"] = body.customer_name
    if body.customer_phone:
        customer_data["phone"] = body.customer_phone
    if body.customer_address is not None:
        customer_data["address"] = body.customer_address
    if body.customer_age is not None:
        customer_data["age"] = body.customer_age

    if body.customer_id:
        customer_id = body.customer_id
        if customer_data:
            supabase.table("customers").update(customer_data).eq("id", customer_id).execute()
    elif body.customer_phone:
        # Check if customer exists by phone
        existing = supabase.table("customers").select("id") \
            .eq("phone", body.customer_phone).execute()
        if existing.data:
            customer_id = existing.data[0]["id"]
            if customer_data:
                supabase.table("customers").update(customer_data).eq("id", customer_id).execute()
        else:
            new_customer = supabase.table("customers").insert(customer_data).execute()
            customer_id = new_customer.data[0]["id"]
    else:
        raise HTTPException(status_code=422, detail="Provide customer_id OR customer_name+customer_phone")

    # 2. Calculate totals and distribute deposit
    is_checked_in_batch = body.is_checked_in if body.is_checked_in is not None else (body.payment_status != "reserved")
    now_time = datetime.now(timezone.utc)
    check_in_dt = now_time if is_checked_in_batch else body.check_in

    check_in_date_local = check_in_dt.astimezone(IST).date() if check_in_dt.tzinfo else check_in_dt.date()
    check_out_date_local = body.check_out.astimezone(IST).date() if body.check_out.tzinfo else body.check_out.date()
    nights = max(1, (check_out_date_local - check_in_date_local).days)
    
    room_ids = [r.room_id for r in body.rooms]
    rooms_res = supabase.table("rooms").select("id, extra_bed_price").in_("id", room_ids).execute()
    room_extra_prices = {r["id"]: float(r["extra_bed_price"] or 500.0) for r in (rooms_res.data or []) if "extra_bed_price" in r and r["extra_bed_price"] is not None}

    room_totals = []
    for r in body.rooms:
        eb_price = room_extra_prices.get(r.room_id, 500.0)
        extra_bed_total = r.extra_beds * eb_price * nights
        room_total = (r.room_price * nights) + extra_bed_total
        room_totals.append(room_total)
        
    remaining_deposit = body.deposit_amount
    bookings_to_create = []
    
    for i, r in enumerate(body.rooms):
        room_total = room_totals[i]
        eb_price = room_extra_prices.get(r.room_id, 500.0)
        extra_bed_total = r.extra_beds * eb_price * nights
        
        if body.payment_status == "paid":
            room_paid = room_total
            room_status = "paid"
            room_dep = 0
        elif body.payment_status == "reserved":
            room_dep = body.deposit_amount / len(body.rooms)
            room_paid = room_dep
            room_status = "reserved"
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
                
        room_is_checked_in = body.is_checked_in if body.is_checked_in is not None else (room_status != "reserved")
        room_check_in_dt = now_time if room_is_checked_in else body.check_in
        
        bookings_to_create.append({
            "room_id":         r.room_id,
            "room_type":       r.room_type,
            "customer_id":     customer_id,
            "check_in":        room_check_in_dt.isoformat(),
            "check_out":       body.check_out.isoformat(),
            "adults":          r.adults,
            "children":        r.children,
            "extra_beds":      r.extra_beds,
            "room_price":      r.room_price,
            "extra_bed_total": extra_bed_total,
            "total_amount":    room_total + (body.extra_bill_amount or 0.0),
            "paid_amount":     room_paid,
            "payment_mode":    body.payment_mode,
            "payment_status":  room_status,
            "deposit_amount":  room_dep,
            "occupation":      body.occupation,
            "notes":           r.notes or body.notes,
            "created_by":      user.get("sub"),
            "is_checked_in":   room_is_checked_in,
            "actual_checkin_time": (body.actual_checkin_time.isoformat() if body.actual_checkin_time else (room_check_in_dt.isoformat() if room_is_checked_in else None)),
            "extra_bill_amount": body.extra_bill_amount or 0.0,
            "extra_bill_note":   body.extra_bill_note,
        })

    # 3. Insert bookings atomically
    try:
        res = supabase.table("bookings").insert(bookings_to_create).execute()
    except Exception as e:
        if "no_overlap" in str(e):
            raise HTTPException(status_code=409, detail="One or more rooms are already booked for these dates")
        if "bookings_payment_mode_check" in str(e) or "23514" in str(e):
            for item in bookings_to_create:
                if item.get("payment_mode") == "IDFC":
                    item["payment_mode"] = "UPI"
                    item["notes"] = f"{item.get('notes') or ''} [Paid via IDFC Bank]".strip()
            res = supabase.table("bookings").insert(bookings_to_create).execute()
        else:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # 4. Update customer last_visit and total_visits
    customer_res = supabase.table("customers").select("total_visits").eq("id", customer_id).execute()
    current_visits = (customer_res.data[0].get("total_visits") or 0) if (customer_res.data and len(customer_res.data) > 0) else 0

    try:
        supabase.table("customers").update({
            "last_visit": body.check_in.date().isoformat(),
            "total_visits": current_visits + len(bookings_to_create),
        }).eq("id", customer_id).execute()
    except Exception as e:
        print("Failed to update customer stats:", e)

    return map_bookings_payment_mode(res.data)

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
        .select("id, booking_number, check_in, check_out, customers(name)") \
        .eq("room_id", room_id) \
        .eq("status", "active") \
        .neq("id", booking_id) \
        .lt("check_in", check_out.isoformat()) \
        .gt("check_out", check_in) \
        .execute()
        
    if overlap_res.data:
        other = overlap_res.data[0]
        customer_name = other.get("customers", {}).get("name", "Another customer") if other.get("customers") else "Another customer"
        return {
            "available": False,
            "reason": f"Room is already booked by {customer_name} from {other['check_in']} to {other['check_out']}."
        }
        
    return {
        "available": True,
        "reason": "Room is available."
    }

@router.get("/cancelled")
def get_cancelled_bookings(user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("*, rooms(*), customers(*)") \
        .eq("status", "cancelled") \
        .order("updated_at", desc=True) \
        .execute()
    return map_bookings_payment_mode(res.data)

@router.get("/{booking_id}")
def get_booking(booking_id: str, user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("*, rooms(*), customers(*), documents(*)") \
        .eq("id", booking_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    return map_booking_payment_mode(res.data)

@router.patch("/{booking_id}")
def update_booking(booking_id: str, body: BookingUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    original_updates = body.dict(exclude_unset=True)
    has_explicit_dates = "check_in" in original_updates or "check_out" in original_updates

    # Auto-fill actual check-in / check-out times on status change/check-in action
    if updates.get("is_checked_in") is True and "check_in" not in original_updates:
        now_time = datetime.now(timezone.utc)
        updates["check_in"] = now_time.isoformat()
        if "actual_checkin_time" not in updates:
            updates["actual_checkin_time"] = now_time.isoformat()

    if updates.get("status") == "checked_out" and "check_out" not in original_updates:
        now_time = datetime.now(timezone.utc)
        updates["check_out"] = now_time.isoformat()
        if "actual_checkout_time" not in updates:
            updates["actual_checkout_time"] = now_time.isoformat()

    # Adjust total_amount if extra_bill_amount is updated
    if "extra_bill_amount" in updates:
        curr_res = supabase.table("bookings").select("extra_bill_amount, total_amount").eq("id", booking_id).single().execute()
        if curr_res.data:
            old_extra = curr_res.data.get("extra_bill_amount") or 0.0
            new_extra = updates["extra_bill_amount"]
            diff = float(new_extra) - float(old_extra)
            if diff != 0 and "total_amount" not in updates:
                updates["total_amount"] = float(curr_res.data.get("total_amount") or 0.0) + diff

    # Convert dates to ISO format
    if "check_in" in updates and updates["check_in"] is not None and isinstance(updates["check_in"], datetime):
        updates["check_in"] = updates["check_in"].isoformat()
    if "check_out" in updates and updates["check_out"] is not None and isinstance(updates["check_out"], datetime):
        updates["check_out"] = updates["check_out"].isoformat()

    # Recalculate totals if price, extra beds, or dates change explicitly
    if any(k in updates for k in ["room_price", "extra_beds", "room_id"]) or (has_explicit_dates and any(k in updates for k in ["check_in", "check_out"])):
        curr_res = supabase.table("bookings").select("room_price, extra_beds, check_in, check_out, extra_bill_amount, paid_amount, room_id").eq("id", booking_id).single().execute()
        if curr_res.data:
            curr = curr_res.data
            r_price = updates.get("room_price", curr["room_price"])
            eb_count = updates.get("extra_beds", curr["extra_beds"])
            c_in_str = updates.get("check_in", curr["check_in"])
            c_out_str = updates.get("check_out", curr["check_out"])
            eb_amount = updates.get("extra_bill_amount", curr["extra_bill_amount"] or 0.0)
            
            c_in = datetime.fromisoformat(c_in_str.replace("Z", "+00:00")).date()
            c_out = datetime.fromisoformat(c_out_str.replace("Z", "+00:00")).date()
            nights = max(1, (c_out - c_in).days)
            
            target_room_id = updates.get("room_id", curr["room_id"])
            room_res = supabase.table("rooms").select("extra_bed_price").eq("id", target_room_id).execute()
            extra_bed_price = room_res.data[0]["extra_bed_price"] if room_res.data and "extra_bed_price" in room_res.data[0] else 500.0
            
            extra_bed_total = eb_count * float(extra_bed_price) * nights
            updates["extra_bed_total"] = extra_bed_total
            
            if "total_amount" not in updates:
                updates["total_amount"] = (r_price * nights) + extra_bed_total + eb_amount

    # Enforce database consistency between paid_amount, total_amount, and payment_status
    if "paid_amount" in updates or "total_amount" in updates or "payment_status" in updates:
        curr_res = supabase.table("bookings").select("paid_amount, total_amount, payment_status").eq("id", booking_id).single().execute()
        if curr_res.data:
            curr = curr_res.data
            p_amt = updates.get("paid_amount", curr["paid_amount"])
            t_amt = updates.get("total_amount", curr["total_amount"])
            p_status = updates.get("payment_status", curr["payment_status"])
            if p_status != "reserved":
                if p_amt >= t_amt:
                    updates["payment_status"] = "paid"
                elif p_amt > 0:
                    updates["payment_status"] = "partial"
                else:
                    updates["payment_status"] = "unpaid"

    if any(k in updates for k in ["room_id"]) or (has_explicit_dates and any(k in updates for k in ["check_in", "check_out"])):
        curr_res = supabase.table("bookings").select("room_id, check_in, check_out").eq("id", booking_id).single().execute()
        if not curr_res.data:
            raise HTTPException(status_code=404, detail="Booking not found")
        curr = curr_res.data
        
        target_room_id = updates.get("room_id", curr["room_id"])
        target_check_in = updates.get("check_in", curr["check_in"])
        target_check_out = updates.get("check_out", curr["check_out"])
        
        overlap_res = supabase.table("bookings") \
            .select("id") \
            .eq("room_id", target_room_id) \
            .eq("status", "active") \
            .neq("id", booking_id) \
            .lt("check_in", target_check_out) \
            .gt("check_out", target_check_in) \
            .execute()
            
        if overlap_res.data:
            raise HTTPException(
                status_code=409,
                detail="Room is already booked or occupied by another customer during this period."
            )

    if "actual_checkin_time" in updates and updates["actual_checkin_time"] is not None and isinstance(updates["actual_checkin_time"], datetime):
        updates["actual_checkin_time"] = updates["actual_checkin_time"].isoformat()

    if "actual_checkout_time" in updates and updates["actual_checkout_time"] is not None and isinstance(updates["actual_checkout_time"], datetime):
        updates["actual_checkout_time"] = updates["actual_checkout_time"].isoformat()

    # Clean up IDFC notes tag if changing payment mode away from IDFC
    if "payment_mode" in updates and updates["payment_mode"] != "IDFC":
        existing_notes = ""
        if "notes" in updates:
            existing_notes = updates["notes"] or ""
        else:
            curr_res = supabase.table("bookings").select("notes").eq("id", booking_id).single().execute()
            if curr_res.data:
                existing_notes = curr_res.data.get("notes") or ""
        
        cleaned_notes = existing_notes.replace("[Paid via IDFC Bank]", "").replace("[IDFC Bank]", "").strip()
        if "notes" in updates or cleaned_notes != existing_notes:
            updates["notes"] = cleaned_notes if cleaned_notes else None

    try:
        res = supabase.table("bookings").update(updates).eq("id", booking_id).execute()
    except Exception as e:
        if "no_overlap" in str(e):
            raise HTTPException(status_code=409, detail="Room already booked for these dates")
        if "bookings_payment_mode_check" in str(e) or "23514" in str(e):
            if updates.get("payment_mode") == "IDFC":
                updates["payment_mode"] = "UPI"
                
                # Fetch existing notes if notes not in updates
                existing_notes = ""
                if "notes" in updates:
                    existing_notes = updates["notes"] or ""
                else:
                    curr_res = supabase.table("bookings").select("notes").eq("id", booking_id).single().execute()
                    if curr_res.data:
                        existing_notes = curr_res.data.get("notes") or ""
                
                # Append IDFC tag if not present
                if "[Paid via IDFC Bank]" not in existing_notes and "[IDFC Bank]" not in existing_notes:
                    updates["notes"] = f"{existing_notes} [Paid via IDFC Bank]".strip()
                else:
                    updates["notes"] = existing_notes

            res = supabase.table("bookings").update(updates).eq("id", booking_id).execute()
        else:
            raise
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    return map_booking_payment_mode(res.data[0])

@router.post("/{booking_id}/restore")
def restore_booking(booking_id: str, user=Depends(get_current_user)):
    try:
        uuid.UUID(booking_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
        
    curr_res = supabase.table("bookings").select("status").eq("id", booking_id).execute()
    if not curr_res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    res = supabase.table("bookings").update({
        "status": "active",
        "actual_checkout_time": None
    }).eq("id", booking_id).execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    return map_booking_payment_mode(res.data[0])


@router.delete("/{booking_id}")
def delete_booking(booking_id: str, user=Depends(get_current_user)):
    try:
        uuid.UUID(booking_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
        
    curr_res = supabase.table("bookings").select("id").eq("id", booking_id).execute()
    if not curr_res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    res = supabase.table("bookings").delete().eq("id", booking_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    return {"message": "Booking deleted successfully", "id": booking_id}
