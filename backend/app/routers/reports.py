from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import datetime, date, timedelta, timezone
from typing import Optional
from app.database import supabase
from app.auth import get_current_user

router = APIRouter()

IST = timezone(timedelta(hours=5, minutes=30))

def require_admin(user=Depends(get_current_user)):
    email = user.get("email")
    if email != "admin@santosh.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Admin only"
        )
    return user

@router.get("/unpaid")
def unpaid_dues(user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("id,booking_number,check_in,check_out,total_amount,paid_amount,deposit_amount,payment_status,payment_mode,status,rooms(number),customers(name,phone)") \
        .neq("status", "cancelled") \
        .in_("payment_status", ["unpaid", "partial", "reserved"]) \
        .order("check_in").execute()
    return res.data

@router.get("/financials")
def get_financials(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    user=Depends(require_admin)
):
    try:
        # 1. Parse dates or set defaults (current month)
        today = date.today()
        if start_date:
            try:
                start_date_dt = datetime.strptime(start_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
        else:
            start_date_dt = datetime.combine(today.replace(day=1), datetime.min.time())

        if end_date:
            try:
                end_date_dt = datetime.strptime(end_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")
        else:
            import calendar
            last_day = calendar.monthrange(today.year, today.month)[1]
            end_date_dt = datetime.combine(today.replace(day=last_day), datetime.min.time())
            
        # Guarantee date time bounds
        start_iso = start_date_dt.isoformat()
        end_date_dt = end_date_dt.replace(hour=23, minute=59, second=59)
        end_iso = end_date_dt.isoformat()
        
        # 2. Get total active rooms count
        rooms_res = supabase.table("rooms").select("id", count="exact").eq("is_active", True).execute()
        total_rooms = rooms_res.count or 0
        if total_rooms == 0:
            rooms_list = supabase.table("rooms").select("id").eq("is_active", True).execute()
            total_rooms = len(rooms_list.data) if rooms_list.data else 1
        
        # 3. Query bookings overlapping the date range
        bookings_res = supabase.table("bookings") \
            .select("id, booking_number, check_in, check_out, total_amount, paid_amount, deposit_amount, payment_mode, checkout_payment_mode, payment_status, status, created_at, extra_bill_amount, notes, rooms(id, room_type, number), customers(name, phone)") \
            .lte("check_in", end_iso) \
            .gte("check_out", start_iso) \
            .order("check_in") \
            .execute()
            
        bookings = bookings_res.data or []
        
        # 4. Compute metrics
        total_revenue = 0.0
        total_bookings = 0
        occupied_nights = 0
        
        # Calculate total outstanding dues globally (across all non-cancelled bookings with unpaid/partial/reserved payment status)
        dues_res = supabase.table("bookings") \
            .select("total_amount, paid_amount") \
            .neq("status", "cancelled") \
            .in_("payment_status", ["unpaid", "partial", "reserved"]) \
            .execute()
        total_dues = sum(max(0.0, float(b["total_amount"] or 0.0) - float(b["paid_amount"] or 0.0)) for b in (dues_res.data or []))
        
        payment_modes = {"Cash": 0.0, "UPI": 0.0, "IDFC": 0.0, "Pending": 0.0}
        room_types = {"AC Deluxe": 0.0, "Non AC Deluxe": 0.0, "VIP AC Suite": 0.0, "VIP Non AC Suite": 0.0}
        
        # Generate continuous trend mapping for all dates in date range
        # Use sets of room IDs to avoid double-counting the same physical room on a day
        trend_data = {}
        trend_room_sets = {}   # date -> set of room_ids blocked that day
        trend_room_numbers = {}  # date -> list of room numbers (for display)
        curr_dt = start_date_dt
        while curr_dt.date() <= end_date_dt.date():
            d_str = curr_dt.date().isoformat()
            trend_data[d_str] = {"date": d_str, "revenue": 0.0, "bookings": 0, "blocked_rooms": 0, "room_numbers": []}
            trend_room_sets[d_str] = set()
            trend_room_numbers[d_str] = {}
            curr_dt += timedelta(days=1)
            
        ledger = []
        
        for b in bookings:
            r_info = b.get("rooms") or {}
            c_info = b.get("customers") or {}
            
            c_name = c_info.get("name", "Unknown")
            c_phone = c_info.get("phone", "")
            c_is_deleted = False
            if c_name.startswith("[DELETED] "):
                c_is_deleted = True
                c_name = c_name.replace("[DELETED] ", "")
                phone_parts = c_phone.split("-deleted-")
                c_phone = phone_parts[0] if phone_parts else c_phone
            
            # Check if this booking's check_in is within the requested reporting range for financial / ledger purposes
            is_financial_match = (b["check_in"] >= start_iso) and (b["check_in"] <= end_iso)
            
            if is_financial_match:
                ledger_item = {
                    "id": b["id"],
                    "booking_number": b["booking_number"],
                    "customer_name": c_name,
                    "customer_phone": c_phone,
                    "customer_is_deleted": c_is_deleted,
                    "room_number": r_info.get("number", "N/A"),
                    "room_type": r_info.get("room_type", ""),
                    "check_in": b["check_in"],
                    "check_out": b["check_out"],
                    "total_amount": int(round(float(b["total_amount"] or 0.0))),
                    "paid_amount": int(round(float(b["paid_amount"] or 0.0))),
                    "deposit_amount": int(round(float(b.get("deposit_amount") or 0.0))),
                    "payment_mode": b.get("payment_mode") or "Pending",
                    "checkout_payment_mode": b.get("checkout_payment_mode"),
                    "payment_status": b.get("payment_status") or "unpaid",
                    "status": b["status"],
                    "created_at": b["created_at"],
                    "extra_bill_amount": int(round(float(b.get("extra_bill_amount") or 0.0))),
                    "notes": b.get("notes") or "",
                }
                ledger.append(ledger_item)
            
            if b["status"] == "cancelled":
                continue
                
            paid = int(round(float(b["paid_amount"] or 0.0)))
            total = int(round(float(b["total_amount"] or 0.0)))
            
            if is_financial_match:
                total_bookings += 1
                total_revenue += paid
                
                # ── Payment mode aggregation ────────────────────────────────────────────
                # Priority:
                #  1. Structured split note: "Paid via IDFC: ₹500 + UPI: ₹2,500" (system-generated at checkout)
                #  2. Informational bracket note: "[Paid via IDFC Bank]" (manually typed by staff)
                #  3. checkout_payment_mode ≠ payment_mode + deposit_amount (structured columns)
                #  4. Single payment_mode fallback
                notes_str = b.get("notes") or ""

                # Pattern 1: System-generated structured split note (starts with "Paid via " followed by Mode: ₹Amount)
                split_note = next(
                    (part.strip() for part in notes_str.split(" | ")
                     if part.strip().startswith("Paid via ") and ": ₹" in part),
                    None
                )

                # Pattern 2: Manually typed bracket note e.g. "[Paid via IDFC Bank]"
                import re as _re
                bracket_match = _re.search(r'\[Paid via ([A-Za-z]+)[^\]]*\]', notes_str)

                if split_note:
                    # Parse "Paid via IDFC: ₹500 + UPI: ₹2,500" — ground truth written at checkout
                    try:
                        rest = split_note[len("Paid via "):]   # "IDFC: ₹500 + UPI: ₹2,500"
                        parts = rest.split(" + ")               # ["IDFC: ₹500", "UPI: ₹2,500"]
                        for part in parts:
                            seg_mode, seg_amt_str = part.split(": ₹")
                            seg_amt = int(round(float(seg_amt_str.replace(",", ""))))
                            seg_mode = seg_mode.strip()
                            if seg_mode not in payment_modes:
                                payment_modes[seg_mode] = 0.0
                            payment_modes[seg_mode] += seg_amt
                    except Exception:
                        # Parse failed — fall back to full paid_amount under payment_mode
                        mode = b.get("payment_mode") or "Pending"
                        if mode not in payment_modes:
                            payment_modes[mode] = 0.0
                        payment_modes[mode] += paid

                elif bracket_match:
                    # Staff typed "[Paid via IDFC Bank]" — treat as paid via that mode.
                    # Use paid_amount if available, otherwise fall back to total_amount
                    # (staff noted payment but forgot to update paid_amount field).
                    note_mode = bracket_match.group(1).strip()  # e.g. "IDFC", "UPI", "Cash"
                    effective_amt = paid if paid > 0 else total
                    if note_mode not in payment_modes:
                        payment_modes[note_mode] = 0.0
                    payment_modes[note_mode] += effective_amt

                else:
                    # No payment note — try structured columns
                    checkout_mode = b.get("checkout_payment_mode")
                    deposit_amt = int(round(float(b.get("deposit_amount") or 0.0)))
                    advance_mode = b.get("payment_mode") or "Pending"

                    if checkout_mode and checkout_mode != advance_mode and deposit_amt > 0:
                        # Split: different modes, payment_mode not overwritten
                        dues_amt = max(0, paid - deposit_amt)
                        if advance_mode not in payment_modes:
                            payment_modes[advance_mode] = 0.0
                        payment_modes[advance_mode] += deposit_amt
                        if checkout_mode not in payment_modes:
                            payment_modes[checkout_mode] = 0.0
                        payment_modes[checkout_mode] += dues_amt
                    else:
                        # Single mode — prefer checkout_payment_mode if available
                        mode = checkout_mode or advance_mode
                        if mode not in payment_modes:
                            payment_modes[mode] = 0.0
                        payment_modes[mode] += paid
                
                # Room type aggregation
                rtype = r_info.get("room_type")
                if rtype:
                    if rtype not in room_types:
                        room_types[rtype] = 0.0
                    room_types[rtype] += paid
            
            # Occupied Nights calculation
            try:
                b_in = datetime.fromisoformat(b["check_in"].replace("Z", "+00:00"))
                b_out = datetime.fromisoformat(b["check_out"].replace("Z", "+00:00"))
                
                overlap_start = max(start_date_dt.replace(tzinfo=b_in.tzinfo), b_in)
                overlap_end = min(end_date_dt.replace(tzinfo=b_in.tzinfo), b_out)
                
                if overlap_start < overlap_end:
                    days = (overlap_end.date() - overlap_start.date()).days
                    occupied_nights += max(1, days)
            except Exception:
                # If error parsing, default to 1 night
                occupied_nights += 1
                
            # Blocked rooms calculation (for occupancy trend)
            # We use a set of room IDs per day so the same physical room is counted only once,
            # even if a data error results in two bookings for the same room on the same day.
            try:
                b_in_ist = datetime.fromisoformat(b["check_in"].replace("Z", "+00:00")).astimezone(IST)
                b_out_ist = datetime.fromisoformat(b["check_out"].replace("Z", "+00:00")).astimezone(IST)
                
                b_in_date = b_in_ist.date()
                b_out_date = b_out_ist.date()
                
                room_id = r_info.get("id") or b.get("id")  # fallback to booking id if room id missing
                room_num = r_info.get("number") or "?"
                
                # Determine the dates this booking occupies.
                # A booking on the same calendar day (check-in == check-out day) counts as 1 night.
                # Otherwise, occupy from check-in date up to (but NOT including) check-out date —
                # because the check-out day the room is freed for new guests.
                if b_in_date >= b_out_date:
                    # Same-day or data anomaly — count just the check-in date
                    occupied_dates = [b_in_date]
                else:
                    occupied_dates = []
                    curr_date = b_in_date
                    while curr_date < b_out_date:
                        occupied_dates.append(curr_date)
                        curr_date += timedelta(days=1)
                
                for occ_date in occupied_dates:
                    d_str = occ_date.isoformat()
                    if d_str in trend_room_sets:
                        if room_id not in trend_room_sets[d_str]:
                            trend_room_sets[d_str].add(room_id)
                            # Track room numbers for display (avoid duplicates)
                            if room_num not in trend_room_numbers[d_str]:
                                trend_room_numbers[d_str][room_num] = True
            except Exception:
                pass
            
            # Flush room sets into trend_data counts (done once after all bookings processed below)
                
            # Trend mapping (group by check_in date)
            if is_financial_match:
                b_in_date = b["check_in"][:10]
                if b_in_date in trend_data:
                    trend_data[b_in_date]["revenue"] += paid
                    trend_data[b_in_date]["bookings"] += 1
                
        # Flush room set counts into trend_data now that all bookings have been processed.
        # Cap at total_rooms so we never show more rooms blocked than physically exist.
        for d_str, room_set in trend_room_sets.items():
            count = min(len(room_set), total_rooms)
            trend_data[d_str]["blocked_rooms"] = count
            trend_data[d_str]["room_numbers"] = sorted(trend_room_numbers[d_str].keys())

        # Calculate occupancy rate, ADR, and avg booking value
        days_in_range = (end_date_dt.date() - start_date_dt.date()).days + 1
        if days_in_range <= 0:
            days_in_range = 1
            
        total_capacity_nights = total_rooms * days_in_range
        occupancy_rate = 0.0
        if total_capacity_nights > 0:
            occupancy_rate = min(100.0, round((occupied_nights / total_capacity_nights) * 100, 1))
            
        adr = 0.0
        if occupied_nights > 0:
            adr = round(total_revenue / occupied_nights, 2)
            
        avg_booking_val = 0.0
        if total_bookings > 0:
            avg_booking_val = round(total_revenue / total_bookings, 2)
            
        return {
            "summary": {
                "total_revenue": round(total_revenue, 2),
                "total_dues": round(total_dues, 2),
                "total_bookings": total_bookings,
                "occupancy_rate": occupancy_rate,
                "adr": adr,
                "avg_booking_value": avg_booking_val,
                "occupied_nights": occupied_nights,
                "total_rooms": total_rooms,
                "days_in_range": days_in_range
            },
            "payment_modes": payment_modes,
            "room_types": room_types,
            "trend": list(trend_data.values()),
            "ledger": ledger
        }
    except Exception as e:
        import logging
        logging.error(f"Error compiling financials report: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error compiling financials report"
        )
