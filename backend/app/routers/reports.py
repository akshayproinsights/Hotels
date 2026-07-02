from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import datetime, date, timedelta
from typing import Optional
from app.database import supabase
from app.auth import get_current_user

router = APIRouter()

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
        .select("id,booking_number,check_in,check_out,total_amount,paid_amount,deposit_amount,payment_status,rooms(number),customers(name,phone)") \
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
        
        # 3. Query bookings checking in within date range
        bookings_res = supabase.table("bookings") \
            .select("id, booking_number, check_in, check_out, total_amount, paid_amount, payment_mode, payment_status, status, created_at, extra_bill_amount, rooms(room_type, number), customers(name, phone)") \
            .gte("check_in", start_iso) \
            .lte("check_in", end_iso) \
            .order("check_in") \
            .execute()
            
        bookings = bookings_res.data or []
        
        # 4. Compute metrics
        total_revenue = 0.0
        total_dues = 0.0
        total_bookings = 0
        occupied_nights = 0
        
        payment_modes = {"Cash": 0.0, "UPI": 0.0, "IDFC": 0.0, "Pending": 0.0}
        room_types = {"AC Deluxe": 0.0, "Non AC Deluxe": 0.0, "VIP AC Suite": 0.0, "VIP Non AC Suite": 0.0}
        
        # Generate continuous trend mapping for all dates in date range
        trend_data = {}
        curr_dt = start_date_dt
        while curr_dt.date() <= end_date_dt.date():
            d_str = curr_dt.date().isoformat()
            trend_data[d_str] = {"date": d_str, "revenue": 0.0, "bookings": 0}
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
                "total_amount": float(b["total_amount"] or 0.0),
                "paid_amount": float(b["paid_amount"] or 0.0),
                "payment_mode": b.get("payment_mode") or "Pending",
                "payment_status": b.get("payment_status") or "unpaid",
                "status": b["status"],
                "created_at": b["created_at"],
                "extra_bill_amount": float(b.get("extra_bill_amount") or 0.0)
            }
            ledger.append(ledger_item)
            
            if b["status"] == "cancelled":
                continue
                
            total_bookings += 1
            paid = float(b["paid_amount"] or 0.0)
            total = float(b["total_amount"] or 0.0)
            
            total_revenue += paid
            total_dues += max(0.0, total - paid)
            
            # Payment mode aggregation
            mode = b.get("payment_mode") or "Pending"
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
                
            # Trend mapping (group by check_in date)
            b_in_date = b["check_in"][:10]
            if b_in_date in trend_data:
                trend_data[b_in_date]["revenue"] += paid
                trend_data[b_in_date]["bookings"] += 1
                
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
