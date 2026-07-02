from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from app.database import supabase
from app.auth import get_current_user
import logging

router = APIRouter()

# Enforce room type constraint at application level
RoomType = Literal['AC Deluxe', 'Non AC Deluxe', 'VIP AC Suite', 'VIP Non AC Suite']

class RoomCreate(BaseModel):
    number: str = Field(..., min_length=1)
    floor: int = Field(..., ge=0)
    room_type: RoomType
    base_price: float = Field(..., gt=0)
    extra_bed_price: float = Field(default=500.0, ge=0)

class RoomUpdate(BaseModel):
    number: Optional[str] = Field(default=None, min_length=1)
    floor: Optional[int] = Field(default=None, ge=0)
    room_type: Optional[RoomType] = None
    base_price: Optional[float] = Field(default=None, gt=0)
    extra_bed_price: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None

@router.get("/available")
def get_available_rooms(
    check_in: datetime = Query(...),
    check_out: datetime = Query(...),
    user=Depends(get_current_user)
):
    """
    Get available rooms for the given datetime range.
    Returns two lists:
      - available: rooms with no overlapping bookings at all
      - partial: rooms whose ONLY conflict is a future booking whose check-in
        falls between our check-in and check-out (i.e., the room is free right now
        but has a reservation starting before our proposed checkout).
        Each partial room includes next_checkin (IST display) so the UI can warn staff.
    """
    try:
        # All active bookings overlapping with the proposed window
        overlapping = supabase.table("bookings") \
            .select("room_id, check_in, check_out") \
            .eq("status", "active") \
            .lt("check_in", check_out.isoformat()) \
            .gt("check_out", check_in.isoformat()) \
            .execute()

        from datetime import timezone, timedelta
        IST = timezone(timedelta(hours=5, minutes=30))

        # Group conflicts by room_id
        conflicts_by_room: dict[str, list[dict]] = {}
        for b in overlapping.data:
            rid = b["room_id"]
            conflicts_by_room.setdefault(rid, []).append(b)

        # Fetch all active rooms
        rooms_res = supabase.table("rooms").select("*").eq("is_active", True).order("floor").order("number").execute()

        available = []
        partial = []

        for room in rooms_res.data:
            rid = room["id"]
            conflicts = conflicts_by_room.get(rid, [])

            if not conflicts:
                available.append(room)
                continue

            # A room is "partial" if ALL its conflicts are bookings that start
            # AFTER our proposed check-in (future arrivals overlapping our checkout window).
            # That means the room is physically free right now / from our check-in date,
            # but the next guest arrives before we'd check out.
            all_future = all(
                datetime.fromisoformat(c["check_in"].replace("Z", "+00:00")) > check_in
                for c in conflicts
            )

            if all_future:
                # Find the earliest next check-in among conflicts
                earliest = min(
                    datetime.fromisoformat(c["check_in"].replace("Z", "+00:00"))
                    for c in conflicts
                )
                earliest_ist = earliest.astimezone(IST)
                room_copy = dict(room)
                room_copy["next_checkin"] = earliest_ist.strftime("%d %b %I:%M %p IST")
                room_copy["next_checkin_iso"] = earliest.isoformat()
                partial.append(room_copy)
            # else: room has a current/active conflict — skip entirely

        return {"available": available, "partial": partial}
    except Exception as e:
        logging.error(f"Error fetching available rooms: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving available rooms"
        )

@router.get("")
def list_rooms(user=Depends(get_current_user)):
    """
    List all rooms ordered by floor and room number.
    """
    try:
        res = supabase.table("rooms").select("*").order("floor").order("number").execute()
        return res.data
    except Exception as e:
        logging.error(f"Error fetching rooms list: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving rooms list"
        )

@router.post("")
def create_room(body: RoomCreate, user=Depends(get_current_user)):
    """
    Create a new room configuration.
    """
    # Restrict room write access: 'santosh' login maps to santosh@santosh.com
    email = user.get("email", "")
    if email.startswith("santosh@"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify room settings"
        )
    try:
        res = supabase.table("rooms").insert(body.dict()).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not create room"
            )
        return res.data[0]
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logging.error(f"Error creating room: {str(e)}")
        # Check for unique key constraint violations (e.g. duplicate room number)
        if "duplicate key" in str(e) or "already exists" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A room with this number already exists"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing room creation request"
        )

@router.patch("/{room_id}")
def update_room(room_id: str, body: RoomUpdate, user=Depends(get_current_user)):
    """
    Updates an existing room configuration.
    Uses exclude_unset=True so is_active=False (deactivate) is not silently dropped.
    """
    # Restrict room write access: 'santosh' login maps to santosh@santosh.com
    email = user.get("email", "")
    if email.startswith("santosh@"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify room settings"
        )
    # exclude_unset=True: only fields the caller explicitly sent — preserves False booleans
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No updates provided"
        )
    try:
        res = supabase.table("rooms").update(updates).eq("id", room_id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Room not found"
            )
        return res.data[0]
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logging.error(f"Error updating room {room_id}: {str(e)}")
        if "duplicate key" in str(e) or "already exists" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A room with this number already exists"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating room"
        )

@router.delete("/{room_id}")
def delete_room(room_id: str, user=Depends(get_current_user)):
    """
    Deletes a room configuration.
    Checks for active bookings before allowing deletion.
    """
    email = user.get("email", "")
    if email.startswith("santosh@"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify room settings"
        )
    try:
        # Check if there are any active bookings for this room
        active_bookings = supabase.table("bookings") \
            .select("id") \
            .eq("room_id", room_id) \
            .eq("status", "active") \
            .execute()
        if active_bookings.data and len(active_bookings.data) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete room because it has active bookings"
            )
        
        res = supabase.table("rooms").delete().eq("id", room_id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Room not found"
            )
        return {"message": "Room deleted successfully", "id": room_id}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logging.error(f"Error deleting room {room_id}: {str(e)}")
        err_msg = str(e).lower()
        if "foreign key" in err_msg or "violates" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete room because it has past booking records in history"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error deleting room"
        )


