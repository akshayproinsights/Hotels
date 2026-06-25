from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.config import settings

# HTTPBearer dependency configuration
bearer = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    """
    Decodes and verifies the JWT auth token provided in the Authorization header.
    Rejects algorithms other than HS256 and validates expiration.
    """
    token = credentials.credentials
    try:
        # HS256 is explicitly passed to prevent algorithm confusion attacks.
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False}
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
