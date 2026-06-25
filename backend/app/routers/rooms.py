from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.database import supabase
from app.auth import get_current_user
import logging

router = APIRouter()

# Enforce room type constraint at application level
RoomType = Literal['AC Deluxe', 'Non AC Deluxe', 'AC Standard', 'Non AC Standard']

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
    try:
        res = supabase.table("rooms").insert(body.dict()).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not create room"
            )
        return res.data[0]
    except Exception as e:
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

