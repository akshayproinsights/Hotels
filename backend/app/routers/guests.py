from fastapi import APIRouter, Depends, Query
from app.database import supabase
from app.auth import get_current_user

router = APIRouter()

@router.get("/search")
def search_guests(q: str = Query(None), user=Depends(get_current_user)):
    # Search by name OR phone (ilike = case-insensitive) if q is provided
    query = supabase.table("guests").select("id,name,phone,address,age,last_visit,total_visits")
    if q and len(q.strip()) >= 2:
        query = query.or_(f"name.ilike.%{q}%,phone.ilike.%{q}%")
    res = query.order("last_visit", desc=True).limit(50).execute()
    return res.data

@router.get("/{guest_id}/bookings")
def guest_bookings(guest_id: str, user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("*, rooms(number, room_type)") \
        .eq("guest_id", guest_id) \
        .order("check_in", desc=True) \
        .limit(20).execute()
    return res.data
