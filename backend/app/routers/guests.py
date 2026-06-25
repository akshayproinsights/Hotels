from fastapi import APIRouter, Depends, Query
from app.database import supabase
from app.auth import get_current_user

router = APIRouter()

@router.get("/search")
def search_guests(q: str = Query(..., min_length=2), user=Depends(get_current_user)):
    # Search by name OR phone (ilike = case-insensitive)
    res = supabase.table("guests").select("id,name,phone,last_visit,total_visits") \
        .or_(f"name.ilike.%{q}%,phone.ilike.%{q}%") \
        .order("last_visit", desc=True) \
        .limit(10).execute()
    return res.data

@router.get("/{guest_id}/bookings")
def guest_bookings(guest_id: str, user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("*, rooms(number, room_type)") \
        .eq("guest_id", guest_id) \
        .order("check_in", desc=True) \
        .limit(20).execute()
    return res.data
