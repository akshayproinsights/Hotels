from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid
from datetime import date
from app.database import supabase
from app.storage import generate_presigned_upload_url, public_url
from app.auth import get_current_user

router = APIRouter()

class UploadRequest(BaseModel):
    booking_id: str
    guest_id: str
    file_name: str
    content_type: str   # e.g. "image/jpeg"

class ConfirmUpload(BaseModel):
    document_id: str

@router.post("/upload-url")
def get_upload_url(body: UploadRequest, user=Depends(get_current_user)):
    doc_id = str(uuid.uuid4())
    today = date.today()
    r2_key = f"docs/{today.year}/{today.month:02d}/{body.booking_id}/{doc_id}_{body.file_name}"

    # Pre-insert document record (status pending)
    supabase.table("documents").insert({
        "id":         doc_id,
        "booking_id": body.booking_id,
        "guest_id":   body.guest_id,
        "r2_key":     r2_key,
        "file_name":  body.file_name,
    }).execute()

    upload_url = generate_presigned_upload_url(r2_key, body.content_type)
    return {"upload_url": upload_url, "document_id": doc_id, "r2_key": r2_key}

@router.post("/confirm")
def confirm_upload(body: ConfirmUpload, user=Depends(get_current_user)):
    res = supabase.table("documents").select("r2_key") \
        .eq("id", body.document_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"public_url": public_url(res.data["r2_key"])}

@router.get("/booking/{booking_id}")
def list_docs(booking_id: str, user=Depends(get_current_user)):
    res = supabase.table("documents").select("*") \
        .eq("booking_id", booking_id).execute()
    return [{"id": d["id"], "file_name": d["file_name"],
             "public_url": public_url(d["r2_key"]),
             "uploaded_at": d["uploaded_at"]} for d in res.data]
