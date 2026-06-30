from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import supabase
from app.auth import get_current_user

router = APIRouter()

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    age: Optional[int] = None

@router.get("/search")
def search_customers(q: str = Query(None), user=Depends(get_current_user)):
    # Search by name OR phone (ilike = case-insensitive) if q is provided
    query = supabase.table("customers").select("id,name,phone,address,age,last_visit,total_visits,created_at")
    if q and len(q.strip()) >= 2:
        query = query.or_(f"name.ilike.%{q}%,phone.ilike.%{q}%")
    res = query.order("last_visit", desc=True).limit(50).execute()
    return res.data

@router.get("/{customer_id}/bookings")
def customer_bookings(customer_id: str, user=Depends(get_current_user)):
    res = supabase.table("bookings") \
        .select("*, rooms(number, room_type)") \
        .eq("customer_id", customer_id) \
        .order("check_in", desc=True) \
        .limit(20).execute()
    return res.data

@router.patch("/{customer_id}")
def update_customer(customer_id: str, body: CustomerUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = supabase.table("customers").update(updates).eq("id", customer_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Customer not found")
    return res.data[0]
