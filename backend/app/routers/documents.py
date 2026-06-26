from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
import uuid
import os
import json
import base64
import urllib.request
import urllib.error
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

@router.get("/guest/{guest_id}")
def list_guest_docs(guest_id: str, user=Depends(get_current_user)):
    res = supabase.table("documents").select("*") \
        .eq("guest_id", guest_id).execute()
    return [{"id": d["id"], "file_name": d["file_name"],
             "public_url": public_url(d["r2_key"]),
             "uploaded_at": d["uploaded_at"]} for d in res.data]

def call_gemini_extract_name(image_bytes: bytes, mime_type: str) -> str:
    from app.config import settings
    api_key = settings.gemini_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured in backend environment variables")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    base64_data = base64.b64encode(image_bytes).decode("utf-8")

    prompt = (
        "You are an OCR assistant for a hotel reception desk. Extract the main guest's full name from the uploaded ID document. "
        "ID documents might be an Aadhar Card, Driving License, Passport, PAN Card, etc. "
        "Search for labels like 'Name', 'Full Name', 'नाम', or similar, and extract the corresponding name value. "
        "Return ONLY the extracted name (e.g. 'John Doe' or 'राजेश कुमार'). If you cannot find any name, return an empty string. "
        "Do not include any formatting, markdown, explanation, or JSON wrapper. Just the name string."
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": base64_data
                        }
                    }
                ]
            }
        ]
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode("utf-8")
            res_json = json.loads(res_data)
            text = res_json["candidates"][0]["content"]["parts"][0]["text"]
            return text.strip()
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"Gemini API Error: {err_msg}")
        raise HTTPException(status_code=500, detail=f"Gemini API Error: {err_msg}")
    except Exception as e:
        print(f"Error calling Gemini API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")

@router.post("/extract-name")
async def extract_name(file: UploadFile = File(...), user=Depends(get_current_user)):
    # Validate mime_type is image or PDF
    if not (file.content_type.startswith("image/") or file.content_type == "application/pdf"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only images and PDFs are allowed.")
    
    file_bytes = await file.read()
    extracted_name = call_gemini_extract_name(file_bytes, file.content_type)
    return {"name": extracted_name}

