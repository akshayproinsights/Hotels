from fastapi import APIRouter, Depends
from app.database import supabase
from app.auth import get_current_user

router = APIRouter()

@router.get("/unpaid")
def unpaid_dues(user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("id,booking_number,check_in,check_out,total_amount,paid_amount,deposit_amount,payment_status,rooms(number),guests(name,phone)") \
        .neq("status", "cancelled") \
        .in_("payment_status", ["unpaid", "partial", "hold"]) \
        .order("check_in").execute()
    return res.data
