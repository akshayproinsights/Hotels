from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from app.routers import auth, rooms, customers, bookings, inventory, calendar, documents, reports

app = FastAPI(
    title="Santosh Palace API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.exception_handler(RequestValidationError)
async def bookings_validation_exception_handler(request: Request, exc: RequestValidationError):
    # Check if this is a bookings-related endpoint
    if "/bookings" in request.url.path:
        try:
            from app.routers.bookings import log_booking_failure
            # Get request body safely
            body = None
            try:
                body = await request.json()
            except Exception:
                try:
                    raw_body = await request.body()
                    if raw_body:
                        body = raw_body.decode("utf-8", errors="ignore")
                except Exception:
                    pass
            
            # Determine the action based on path and method
            action = "create_booking"
            if request.url.path.endswith("/batch"):
                action = "create_bookings_batch"
            elif request.method == "PATCH":
                action = "update_booking"

            log_booking_failure(
                error_message=f"Validation Error: {exc.errors()}",
                payload=body,
                user=None,
                error_type="RequestValidationError",
                action=action
            )
        except Exception as log_err:
            import logging
            logging.error(f"Error logging validation failure: {str(log_err)}")

    from fastapi.exception_handlers import request_validation_exception_handler
    return await request_validation_exception_handler(request, exc)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Secure HTTP Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Mitigate XSS attacks by checking content-type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Mitigate clickjacking attacks
    response.headers["X-Frame-Options"] = "DENY"
    # Content Security Policy (strict API defaults)
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    # Disable unused browser features
    response.headers["Permission-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

# Register routers
app.include_router(auth.router,      prefix="/auth",      tags=["auth"])
app.include_router(rooms.router,     prefix="/rooms",     tags=["rooms"])
app.include_router(customers.router, prefix="/customers", tags=["customers"])
app.include_router(bookings.router,  prefix="/bookings",  tags=["bookings"])
app.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
app.include_router(calendar.router,  prefix="/calendar",  tags=["calendar"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(reports.router,   prefix="/reports",   tags=["reports"])

@app.get("/health")
def health():
    return {"status": "ok", "service": "santosh-palace-api"}
