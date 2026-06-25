from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from app.database import supabase
from app.auth import get_current_user
import logging

router = APIRouter()

# Input validation model
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/login")
def login(body: LoginRequest):
    """
    Authenticates staff user via Supabase Auth and returns JWT token.
    """
    try:
        res = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password
        })
        if not res.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        return {
            "access_token": res.session.access_token,
            "user": {
                "id": str(res.user.id),
                "email": res.user.email,
                "name": res.user.user_metadata.get("name", ""),
            }
        }
    except Exception as e:
        # Prevent exposing internal exception details to the user.
        logging.error(f"Login failure error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

@router.post("/logout")
def logout(user=Depends(get_current_user)):
    """
    Sign out user session.
    """
    try:
        supabase.auth.sign_out()
    except Exception as e:
        logging.error(f"Sign out exception: {str(e)}")
    return {"message": "logged out"}

@router.get("/me")
def me(user=Depends(get_current_user)):
    """
    Retrieves current user email, id, and display name from JWT payload.
    """
    return {
        "id":    user.get("sub"),
        "email": user.get("email"),
        "name":  user.get("user_metadata", {}).get("name", ""),
    }
