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
    customer_id: str
    file_name: str
    content_type: str   # e.g. "image/jpeg"
    doc_type: str = "id_proof"

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
        "customer_id": body.customer_id,
        "r2_key":     r2_key,
        "file_name":  body.file_name,
        "doc_type":   body.doc_type,
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

@router.get("/customer/{customer_id}")
def list_customer_docs(customer_id: str, user=Depends(get_current_user)):
    res = supabase.table("documents").select("*") \
        .eq("customer_id", customer_id).execute()
    return [{"id": d["id"], "file_name": d["file_name"],
             "public_url": public_url(d["r2_key"]),
             "uploaded_at": d["uploaded_at"]} for d in res.data]

from typing import List

def call_gemini_extract_details(
    files_data: List[tuple] | tuple | bytes,
    mime_type: str | None = None
) -> dict:
    from app.config import settings
    api_key = settings.gemini_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured in backend environment variables")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

    # Normalize input to list of (file_bytes, mime_type)
    normalized_files = []
    if isinstance(files_data, list):
        normalized_files = files_data
    elif isinstance(files_data, tuple):
        normalized_files = [files_data]
    elif isinstance(files_data, bytes):
        if not mime_type:
            raise HTTPException(status_code=400, detail="mime_type must be provided if raw bytes are passed")
        normalized_files = [(files_data, mime_type)]
    else:
        raise HTTPException(status_code=400, detail="Invalid input type for call_gemini_extract_details")

    prompt = (
        "You are an OCR assistant for a hotel reception desk. Extract the customer details from the uploaded ID document image(s). "
        "ID documents might be an Aadhar Card, Driving License, Passport, PAN Card, etc.\n\n"
        "Extract the following fields:\n"
        "1. Full Name: Look for labels like 'Name', 'Full Name', 'नाम', or similar. Extract the name and format it as 'English Name (Marathi Name)'. "
        "The English Name part must be in Latin script (e.g. 'John Doe' or 'Rahul Sharma'). If the name is in Devanagari script on the card, transliterate/convert it to Latin script. "
        "The Marathi Name part must be inside parentheses and in Devanagari script (e.g. '(जॉन डो)' or '(राहुल शर्मा)'). If the name is in Latin script on the card, transliterate it to Devanagari. "
        "Example format: 'John Doe (जॉन डो)'. Ensure there is exactly one space before the opening parenthesis.\n"
        "2. Address: Look for labels like 'Address', 'पता', or similar. Return the complete address value. If not found, return empty string.\n"
        "3. Age: Look for Date of Birth (DOB), Year of Birth (YOB), or labels like 'DOB', 'Year of Birth', 'जन्म तारीख', 'जन्म वर्ष'. "
        f"Calculate the customer's age as of today ({date.today().isoformat()}). "
        "The age must be a whole number (integer). If DOB/YOB cannot be found, calculate/return null.\n\n"
        "Return the output as a valid JSON object with the keys 'name', 'address', and 'age'. "
        "Do not include any markdown formatting, code blocks, or extra text. Just the raw JSON string. "
        "Example output:\n"
        "{\"name\": \"John Doe (जॉन डो)\", \"address\": \"123 Main St, New York, NY\", \"age\": 34}"
    )

    parts = [{"text": prompt}]
    for file_bytes, mtype in normalized_files:
        base64_data = base64.b64encode(file_bytes).decode("utf-8")
        parts.append({
            "inlineData": {
                "mimeType": mtype,
                "data": base64_data
            }
        })

    payload = {
        "contents": [
            {
                "parts": parts
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
            text = res_json["candidates"][0]["content"]["parts"][0]["text"].strip()
            
            # Clean up potential markdown formatting (like ```json ... ```)
            if text.startswith("```"):
                lines = text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                text = "\n".join(lines).strip()
                
            try:
                details = json.loads(text)
                name_val = details.get("name")
                addr_val = details.get("address")
                return {
                    "name": name_val.strip() if name_val else "",
                    "address": addr_val.strip() if addr_val else "",
                    "age": details.get("age")
                }
            except json.JSONDecodeError:
                # Fallback: if JSON fails to parse, return text as name
                return {"name": text, "address": "", "age": None}
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"Gemini API Error: {err_msg}")
        raise HTTPException(status_code=500, detail=f"Gemini API Error: {err_msg}")
    except Exception as e:
        print(f"Error calling Gemini API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")

@router.post("/extract-name")
async def extract_name(
    file: UploadFile = File(None),
    files: List[UploadFile] = File(None),
    user=Depends(get_current_user)
):
    all_files = []
    if file is not None:
        all_files.append(file)
    if files is not None:
        all_files.extend(files)
        
    # filter out empty files or mock files without filenames
    all_files = [f for f in all_files if f.filename]
        
    if not all_files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
        
    files_data = []
    for f in all_files:
        if not (f.content_type.startswith("image/") or f.content_type == "application/pdf"):
            raise HTTPException(status_code=400, detail=f"Invalid file type for {f.filename}. Only images and PDFs are allowed.")
        file_bytes = await f.read()
        files_data.append((file_bytes, f.content_type))
        
    extracted_details = call_gemini_extract_details(files_data)
    return extracted_details


@router.delete("/{document_id}")
def delete_document(document_id: str, user=Depends(get_current_user)):
    try:
        uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
        
    res = supabase.table("documents").select("id, r2_key").eq("id", document_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found")
        
    doc = res.data[0]
    
    # 1. Delete from Cloudflare R2
    from app.storage import delete_file
    try:
        delete_file(doc["r2_key"])
    except Exception as e:
        import logging
        logging.error(f"Error deleting file from R2 for document {document_id}: {str(e)}")
        
    # 2. Delete from database
    supabase.table("documents").delete().eq("id", document_id).execute()
    return {"message": "Document deleted successfully", "id": document_id}

