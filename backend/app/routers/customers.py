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
    # Fetch customers with their bookings to calculate latest checkout time
    query = supabase.table("customers").select(
        "id,name,phone,address,age,last_visit,total_visits,created_at,bookings(actual_checkout_time,status)"
    )
    if q and len(q.strip()) >= 2:
        query = query.or_(f"name.ilike.%{q}%,phone.ilike.%{q}%")
    res = query.limit(1000).execute()
    
    data = res.data or []

    # Sort logic to order by latest checkout time descending
    def get_last_checkout_time(customer):
        checkout_times = []
        for b in customer.get("bookings", []):
            if b.get("status") == "checked_out" and b.get("actual_checkout_time"):
                checkout_times.append(b["actual_checkout_time"])
        return max(checkout_times) if checkout_times else ""

    def sort_key(customer):
        last_checkout = get_last_checkout_time(customer)
        has_checkout = 1 if last_checkout else 0
        last_visit = customer.get("last_visit") or ""
        created_at = customer.get("created_at") or ""
        return (has_checkout, last_checkout, last_visit, created_at)

    data.sort(key=sort_key, reverse=True)

    # Remove bookings key from each customer to match the expected return signature
    for customer in data:
        customer.pop("bookings", None)

    return data[:50]

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

@router.delete("/{customer_id}")
def delete_customer(customer_id: str, user=Depends(get_current_user)):
    try:
        res = supabase.table("customers").delete().eq("id", customer_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"message": "Customer deleted successfully", "id": customer_id}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        err_msg = str(e).lower()
        if "foreign key" in err_msg or "violates" in err_msg:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete customer because they have booking records in history"
            )
        raise HTTPException(
            status_code=500,
            detail="Error deleting customer"
        )

