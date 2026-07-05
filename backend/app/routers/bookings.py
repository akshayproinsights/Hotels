from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
import uuid
from typing import Optional, Literal
from datetime import datetime, timezone, timedelta
import logging
from logging.handlers import RotatingFileHandler
import os
import json
import traceback
from app.database import supabase
from app.auth import get_current_user

# Local timezone helper for IST (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))

# Setup booking failures logging
LOGS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "logs"))
os.makedirs(LOGS_DIR, exist_ok=True)
log_file_path = os.path.join(LOGS_DIR, "booking_failures.log")

failure_logger = logging.getLogger("booking_failures")
failure_logger.setLevel(logging.ERROR)
failure_logger.propagate = False

def setup_failure_logger():
    has_handler = any(isinstance(h, RotatingFileHandler) for h in failure_logger.handlers)
    if not has_handler:
        file_handler = RotatingFileHandler(log_file_path, maxBytes=10*1024*1024, backupCount=5, encoding="utf-8")
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        failure_logger.addHandler(file_handler)

setup_failure_logger()

def log_booking_failure(
    error_message: str,
    payload: any,
    user: dict | None,
    error_type: str,
    action: str = "create_booking"
):
    setup_failure_logger()
    try:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "error_type": error_type,
            "error_message": error_message,
            "user_id": user.get("sub") if user else "Unknown",
            "user_email": user.get("email") if user else "Unknown",
        }
        
        if payload is not None:
            try:
                payload_dict = jsonable_encoder(payload)
            except Exception:
                payload_dict = str(payload)
            
            def mask_pii(data):
                if isinstance(data, dict):
                    masked = data.copy()
                    if "customer_phone" in masked and masked["customer_phone"]:
                        phone = str(masked["customer_phone"])
                        if len(phone) >= 4:
                            masked["customer_phone"] = f"******{phone[-4:]}"
                        else:
                            masked["customer_phone"] = "***"
                    if "customer_name" in masked and masked["customer_name"]:
                        name = str(masked["customer_name"])
                        if len(name) > 2:
                            masked["customer_name"] = f"{name[0]}***{name[-1]}"
                        else:
                            masked["customer_name"] = "***"
                    return {k: mask_pii(v) for k, v in masked.items()}
                elif isinstance(data, list):
                    return [mask_pii(item) for item in data]
                return data

            log_entry["payload"] = mask_pii(payload_dict)
            
        failure_logger.error(json.dumps(log_entry))
    except Exception as log_ex:
        logging.error(f"Error writing to booking failures log: {str(log_ex)}")

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
    checkout_payment_mode: Optional[str] = None   # NEW — mode used to collect at checkout
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
    try:
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

        is_non_ac = "Non AC" in body.room_type
        eb_col = "non_ac_extra_bed_price" if is_non_ac else "extra_bed_price"
        room_res = supabase.table("rooms").select(eb_col).eq("id", body.room_id).execute()
        extra_bed_price = int(round(float(room_res.data[0][eb_col]))) if room_res.data and eb_col in room_res.data[0] else 500
        extra_bed_total = int(round(body.extra_beds * extra_bed_price * nights))
        extra_bill_amount = int(round(body.extra_bill_amount or 0.0))
        if body.total_amount is not None:
            total_amount = int(round(body.total_amount))
        else:
            total_amount = int(round(body.room_price * nights)) + extra_bed_total + extra_bill_amount
        # For 'paid': full amount; for 'partial'/'reserved'/'unpaid': only the deposit amount received
        paid_amount = total_amount if body.payment_status == "paid" else int(round(body.deposit_amount))

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
    except HTTPException as http_ex:
        log_booking_failure(
            error_message=http_ex.detail,
            payload=body,
            user=user,
            error_type="HTTPException",
            action="create_booking"
        )
        raise
    except Exception as exc:
        log_booking_failure(
            error_message=f"{str(exc)}\n{traceback.format_exc()}",
            payload=body,
            user=user,
            error_type=exc.__class__.__name__,
            action="create_booking"
        )
        raise

@router.post("/batch")
def create_bookings_batch(body: BookingBatchCreate, user=Depends(get_current_user)):
    try:
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
        rooms_res = supabase.table("rooms").select("id, extra_bed_price, non_ac_extra_bed_price").in_("id", room_ids).execute()
        room_extra_prices = {r["id"]: int(round(float(r["extra_bed_price"] or 500.0))) for r in (rooms_res.data or []) if "extra_bed_price" in r and r["extra_bed_price"] is not None}
        room_non_ac_extra_prices = {r["id"]: int(round(float(r["non_ac_extra_bed_price"] or 500.0))) for r in (rooms_res.data or []) if "non_ac_extra_bed_price" in r and r["non_ac_extra_bed_price"] is not None}

        room_totals = []
        for r in body.rooms:
            is_non_ac = "Non AC" in r.room_type
            eb_price = room_non_ac_extra_prices.get(r.room_id, 500) if is_non_ac else room_extra_prices.get(r.room_id, 500)
            extra_bed_total = int(round(r.extra_beds * eb_price * nights))
            room_total = int(round(r.room_price * nights)) + extra_bed_total
            room_totals.append(room_total)

        # If the frontend sent an explicit total_amount (user edited the rate),
        # distribute it proportionally across rooms instead of recalculating.
        # Single-room bookings: the edited total is used directly.
        # Multi-room bookings: prorate by each room's share of the base total.
        extra_bill_amt = int(round(body.extra_bill_amount or 0.0))
        base_total_sum = sum(room_totals)  # sum of room_price * nights for all rooms
        if body.total_amount is not None and body.total_amount > 0 and base_total_sum > 0:
            # Strip out the extra_bill_amount before distributing (it is added back per room below)
            user_total_no_extra = int(round(body.total_amount)) - extra_bill_amt
            room_totals_floats = [
                (rt / base_total_sum) * user_total_no_extra
                for rt in room_totals
            ]
            room_totals_int = [int(round(t)) for t in room_totals_floats]
            current_sum = sum(room_totals_int)
            diff = user_total_no_extra - current_sum
            
            if diff != 0:
                step = 1 if diff > 0 else -1
                for idx in range(abs(int(diff))):
                    room_totals_int[idx % len(room_totals_int)] += step
            room_totals = room_totals_int

        remaining_deposit = int(round(body.deposit_amount))
        bookings_to_create = []
        
        for i, r in enumerate(body.rooms):
            room_total = room_totals[i]
            is_non_ac = "Non AC" in r.room_type
            eb_price = room_non_ac_extra_prices.get(r.room_id, 500) if is_non_ac else room_extra_prices.get(r.room_id, 500)
            extra_bed_total = int(round(r.extra_beds * eb_price * nights))
            
            if body.payment_status == "paid":
                room_paid = room_total
                room_status = "paid"
                room_dep = 0
            elif body.payment_status == "reserved":
                num_rooms = len(body.rooms)
                base_dep = remaining_deposit // num_rooms
                remainder = remaining_deposit % num_rooms
                room_dep = base_dep + (1 if i < remainder else 0)
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
                "total_amount":    room_total + extra_bill_amt,
                "paid_amount":     room_paid,
                "payment_mode":    body.payment_mode,
                "payment_status":  room_status,
                "deposit_amount":  room_dep,
                "occupation":      body.occupation,
                "notes":           r.notes or body.notes,
                "created_by":      user.get("sub"),
                "is_checked_in":   room_is_checked_in,
                "actual_checkin_time": (body.actual_checkin_time.isoformat() if body.actual_checkin_time else (room_check_in_dt.isoformat() if room_is_checked_in else None)),
                "extra_bill_amount": extra_bill_amt,
                "extra_bill_note":   body.extra_bill_note,
            })
            
        # 3. Insert bookings atomically
        try:
            res = supabase.table("bookings").insert(bookings_to_create).execute()
        except Exception as e:
            err_str = str(e)
            if "no_overlap" in err_str:
                raise HTTPException(status_code=409, detail="One or more rooms are already booked for these dates")
            if "bookings_room_type_check" in err_str:
                bad_types = list({item["room_type"] for item in bookings_to_create})
                logging.error(f"room_type check constraint violated — types sent: {bad_types}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Room type '{bad_types[0] if bad_types else 'unknown'}' is not allowed by the database constraint. "
                           f"Please update the bookings_room_type_check constraint in Supabase to include VIP room types."
                )
            if "bookings_payment_mode_check" in err_str or ("23514" in err_str):
                for item in bookings_to_create:
                    if item.get("payment_mode") == "IDFC":
                        item["payment_mode"] = "UPI"
                        item["notes"] = f"{item.get('notes') or ''} [Paid via IDFC Bank]".strip()
                res = supabase.table("bookings").insert(bookings_to_create).execute()
            else:
                raise HTTPException(status_code=500, detail=f"Database error: {err_str}")

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
    except HTTPException as http_ex:
        log_booking_failure(
            error_message=http_ex.detail,
            payload=body,
            user=user,
            error_type="HTTPException",
            action="create_bookings_batch"
        )
        raise
    except Exception as exc:
        log_booking_failure(
            error_message=f"{str(exc)}\n{traceback.format_exc()}",
            payload=body,
            user=user,
            error_type=exc.__class__.__name__,
            action="create_bookings_batch"
        )
        raise

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

@router.get("")
def get_all_bookings(user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("*, rooms(*), customers(*)") \
        .order("created_at", desc=True) \
        .execute()
    return map_bookings_payment_mode(res.data)

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
    try:
        updates = {k: v for k, v in body.dict().items() if v is not None}
        for field in ["room_price", "paid_amount", "total_amount", "extra_bill_amount", "deposit_amount"]:
            if field in updates and updates[field] is not None:
                updates[field] = int(round(float(updates[field])))
        original_updates = body.dict(exclude_unset=True)
        has_explicit_dates = "check_in" in original_updates or "check_out" in original_updates

        # Auto-fill actual check-in / check-out times on status change/check-in action
        # NOTE: We do NOT overwrite check_in (the scheduled date) with now() because:
        #   1. If now() > check_out, Postgres raises "range lower bound must be <= upper bound"
        #   2. Changing the date range can trigger the no-overlap exclusion constraint
        # Instead, only record actual_checkin_time to capture the physical arrival timestamp.
        if updates.get("is_checked_in") is True and "actual_checkin_time" not in updates:
            now_time = datetime.now(timezone.utc)
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
                old_extra = int(round(float(curr_res.data.get("extra_bill_amount") or 0.0)))
                new_extra = updates["extra_bill_amount"]
                diff = new_extra - old_extra
                if diff != 0 and "total_amount" not in updates:
                    updates["total_amount"] = int(round(float(curr_res.data.get("total_amount") or 0.0))) + diff

        # Convert dates to ISO format
        if "check_in" in updates and updates["check_in"] is not None and isinstance(updates["check_in"], datetime):
            updates["check_in"] = updates["check_in"].isoformat()
        if "check_out" in updates and updates["check_out"] is not None and isinstance(updates["check_out"], datetime):
            updates["check_out"] = updates["check_out"].isoformat()

        # Recalculate totals if price, extra beds, or dates change explicitly
        if any(k in updates for k in ["room_price", "extra_beds", "room_id"]) or (has_explicit_dates and any(k in updates for k in ["check_in", "check_out"])):
            curr_res = supabase.table("bookings").select("room_price, extra_beds, check_in, check_out, extra_bill_amount, paid_amount, room_id, room_type").eq("id", booking_id).single().execute()
            if curr_res.data:
                curr = curr_res.data
                r_price = int(round(float(updates.get("room_price", curr["room_price"]))))
                eb_count = int(updates.get("extra_beds", curr["extra_beds"]))
                c_in_str = updates.get("check_in", curr["check_in"])
                c_out_str = updates.get("check_out", curr["check_out"])
                eb_amount = int(round(float(updates.get("extra_bill_amount", curr["extra_bill_amount"] or 0.0))))
                
                c_in = datetime.fromisoformat(c_in_str.replace("Z", "+00:00")).date()
                c_out = datetime.fromisoformat(c_out_str.replace("Z", "+00:00")).date()
                nights = max(1, (c_out - c_in).days)
                
                target_room_id = updates.get("room_id", curr["room_id"])
                r_type = updates.get("room_type", curr["room_type"])
                is_non_ac = "Non AC" in r_type
                eb_col = "non_ac_extra_bed_price" if is_non_ac else "extra_bed_price"
                room_res = supabase.table("rooms").select(eb_col).eq("id", target_room_id).execute()
                extra_bed_price = int(round(float(room_res.data[0][eb_col]))) if room_res.data and eb_col in room_res.data[0] else 500
                
                extra_bed_total = eb_count * extra_bed_price * nights
                updates["extra_bed_total"] = extra_bed_total
                
                if "total_amount" not in updates:
                    updates["total_amount"] = (r_price * nights) + extra_bed_total + eb_amount

        # Enforce database consistency between paid_amount, total_amount, and payment_status
        if "paid_amount" in updates or "total_amount" in updates or "payment_status" in updates:
            curr_res = supabase.table("bookings").select("paid_amount, total_amount, payment_status").eq("id", booking_id).single().execute()
            if curr_res.data:
                curr = curr_res.data
                p_amt = int(round(float(updates.get("paid_amount", curr["paid_amount"]))))
                t_amt = int(round(float(updates.get("total_amount", curr["total_amount"]))))
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
    except HTTPException as http_ex:
        log_booking_failure(
            error_message=http_ex.detail,
            payload={"booking_id": booking_id, "updates": body.dict(exclude_unset=True)},
            user=user,
            error_type="HTTPException",
            action="update_booking"
        )
        raise
    except Exception as exc:
        log_booking_failure(
            error_message=f"{str(exc)}\n{traceback.format_exc()}",
            payload={"booking_id": booking_id, "updates": body.dict(exclude_unset=True)},
            user=user,
            error_type=exc.__class__.__name__,
            action="update_booking"
        )
        raise

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


@router.post("/auto-process")
def auto_process_bookings(user=Depends(get_current_user)):
    """
    Automatically check-in and check-out bookings based on current time.
    
    - Auto Check-In: any active booking where is_checked_in=False AND check_in <= now
    - Auto Check-Out: any active booking where check_out <= now
    
    This endpoint is called silently by the frontend on every page load and every 5 minutes
    so room availability is always accurate even if staff forget to manually process guests.
    """
    now = datetime.now(IST)          # IST (UTC+5:30) — bookings are stored/compared in local time
    now_iso = now.isoformat()

    checked_in_count = 0
    checked_out_count = 0
    errors = []

    try:
        # ── AUTO CHECK-IN ──────────────────────────────────────────────────────
        # Find all active bookings that have NOT been checked in yet
        # but whose check_in time has already passed.
        # Applies to ALL bookings regardless of payment_status (including reserved).
        pending_checkins = supabase.table("bookings") \
            .select("id, check_in, check_out") \
            .eq("status", "active") \
            .eq("is_checked_in", False) \
            .lte("check_in", now_iso) \
            .execute()

        for booking in (pending_checkins.data or []):
            try:
                # Skip if check_out has also already passed — will be handled by auto-checkout below
                check_out_dt = datetime.fromisoformat(booking["check_out"].replace("Z", "+00:00"))
                if check_out_dt <= now:
                    continue  # let auto-checkout handle it

                supabase.table("bookings").update({
                    "is_checked_in": True,
                    "actual_checkin_time": now_iso,
                }).eq("id", booking["id"]).execute()
                checked_in_count += 1
            except Exception as e:
                errors.append(f"checkin {booking['id']}: {str(e)}")

        # ── AUTO CHECK-OUT ─────────────────────────────────────────────────────
        # Find all active bookings whose check_out time has already passed.
        # Mark them as checked_out to free the room.
        # If the booking still has unpaid dues, also set payment_mode='Pending'
        # so the UI treats it as "Checkout (Payment Pending)" — identical to
        # what happens when staff manually clicks that button.
        pending_checkouts = supabase.table("bookings") \
            .select("id, check_out, is_checked_in, payment_status, paid_amount, total_amount, payment_mode") \
            .eq("status", "active") \
            .lte("check_out", now_iso) \
            .execute()

        for booking in (pending_checkouts.data or []):
            try:
                update_payload: dict = {
                    "status": "checked_out",
                    "actual_checkout_time": now_iso,
                }
                # If somehow never checked in, mark it as well
                if not booking.get("is_checked_in"):
                    update_payload["is_checked_in"] = True
                    update_payload["actual_checkin_time"] = now_iso

                # If the guest has outstanding dues, flag payment_mode as 'Pending'
                # so the Dues tab and BookingDetailSheet display it as
                # "Checkout (Payment Pending)" rather than a plain unpaid booking.
                paid = booking.get("paid_amount") or 0
                total = booking.get("total_amount") or 0
                pstatus = booking.get("payment_status", "")
                has_dues = pstatus in ("unpaid", "partial") or paid < total
                if has_dues and booking.get("payment_mode") != "Pending":
                    update_payload["payment_mode"] = "Pending"

                supabase.table("bookings").update(update_payload).eq("id", booking["id"]).execute()
                checked_out_count += 1
            except Exception as e:
                errors.append(f"checkout {booking['id']}: {str(e)}")

    except Exception as exc:
        logging.error(f"auto_process_bookings error: {exc}")
        raise HTTPException(status_code=500, detail=f"Auto-process failed: {str(exc)}")

    return {
        "checked_in": checked_in_count,
        "checked_out": checked_out_count,
        "errors": errors,
    }
