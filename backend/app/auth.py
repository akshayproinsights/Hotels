import json
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.config import settings

# HTTPBearer dependency configuration
bearer = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    """
    Decodes and verifies the JWT auth token provided in the Authorization header.
    Supports both HS256 (symmetric) and ES256 (asymmetric JWKS) token verification.
    """
    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "ES256":
            if not settings.supabase_jwks:
                raise JWTError("ES256 token received but SUPABASE_JWKS is not configured")
            jwks = json.loads(settings.supabase_jwks)
            payload = jwt.decode(
                token,
                jwks,
                algorithms=["ES256"],
                options={"verify_aud": False}
            )
        else:
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
